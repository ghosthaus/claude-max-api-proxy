/**
 * API Route Handlers
 *
 * Implements OpenAI-compatible endpoints using direct Anthropic API
 */

import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { callAnthropic, callAnthropicStream, AnthropicMessage } from "../anthropic/client.js";
import type { OpenAIChatRequest } from "../types/openai.js";

const logRequest = (body: OpenAIChatRequest) => {
  const timestamp = new Date().toISOString();
  const model = body.model || 'unknown';
  const msgCount = body.messages?.length || 0;
  const lastMsg = body.messages?.[body.messages.length - 1];
  const preview = lastMsg?.content?.slice(0, 100) || '';
  const stream = body.stream ? 'STREAM' : 'non-stream';
  console.log(`[${timestamp}] Request: model=${model} ${stream} messages=${msgCount} last="${preview}..."`);
};

const logResponse = (requestId: string, content: string) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Response ${requestId}: "${content.slice(0, 100)}..."`);
};

/**
 * Convert OpenAI messages to Anthropic format
 */
function convertMessages(messages: OpenAIChatRequest["messages"]): { 
  system?: string; 
  messages: AnthropicMessage[] 
} {
  let system: string | undefined;
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Anthropic uses system as a separate field
      system = system ? `${system}\n\n${msg.content}` : msg.content;
    } else if (msg.role === "user" || msg.role === "assistant") {
      anthropicMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Ensure conversation starts with user message
  if (anthropicMessages.length > 0 && anthropicMessages[0].role === "assistant") {
    anthropicMessages.unshift({ role: "user", content: "(continue)" });
  }

  return { system, messages: anthropicMessages };
}

/**
 * Handle POST /v1/chat/completions
 */
export async function handleChatCompletions(
  req: Request,
  res: Response
): Promise<void> {
  const requestId = uuidv4().replace(/-/g, "").slice(0, 24);
  const body = req.body as OpenAIChatRequest;
  const stream = body.stream === true;
  
  logRequest(body);

  try {
    // Validate request
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({
        error: {
          message: "messages is required and must be a non-empty array",
          type: "invalid_request_error",
          code: "invalid_messages",
        },
      });
      return;
    }

    const { system, messages } = convertMessages(body.messages);

    if (stream) {
      await handleStreamingResponse(res, requestId, body.model, system, messages);
    } else {
      await handleNonStreamingResponse(res, requestId, body.model, system, messages);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[handleChatCompletions] Error:", message);

    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message,
          type: "server_error",
          code: null,
        },
      });
    }
  }
}

/**
 * Handle streaming response (SSE)
 */
async function handleStreamingResponse(
  res: Response,
  requestId: string,
  model: string,
  system: string | undefined,
  messages: AnthropicMessage[]
): Promise<void> {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Request-Id", requestId);
  res.flushHeaders();

  // Send initial comment
  res.write(":ok\n\n");

  let isFirst = true;
  let fullText = "";

  try {
    await callAnthropicStream(
      { model, messages, max_tokens: 8192, system },
      // onChunk
      (text: string) => {
        fullText += text;
        
        if (isFirst) {
          // Send role chunk
          res.write(`data: ${JSON.stringify({
            id: `chatcmpl-${requestId}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
          })}\n\n`);
          isFirst = false;
        }

        // Send content chunk
        res.write(`data: ${JSON.stringify({
          id: `chatcmpl-${requestId}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        })}\n\n`);
      },
      // onDone
      (result) => {
        logResponse(requestId, fullText);
        
        // Send final chunk with finish_reason
        res.write(`data: ${JSON.stringify({
          id: `chatcmpl-${requestId}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: result.model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Streaming] Error:", message);
    
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({
        error: { message, type: "server_error", code: null },
      })}\n\n`);
      res.end();
    }
  }
}

/**
 * Handle non-streaming response
 */
async function handleNonStreamingResponse(
  res: Response,
  requestId: string,
  model: string,
  system: string | undefined,
  messages: AnthropicMessage[]
): Promise<void> {
  try {
    const result = await callAnthropic({ model, messages, max_tokens: 8192, system });
    
    const content = result.content
      .filter(c => c.type === "text")
      .map(c => c.text)
      .join("");

    logResponse(requestId, content);

    res.json({
      id: `chatcmpl-${requestId}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: result.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: result.usage.input_tokens,
        completion_tokens: result.usage.output_tokens,
        total_tokens: result.usage.input_tokens + result.usage.output_tokens,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[NonStreaming] Error:", message);
    
    res.status(500).json({
      error: {
        message,
        type: "server_error",
        code: null,
      },
    });
  }
}

/**
 * Handle GET /v1/models
 */
export function handleModels(_req: Request, res: Response): void {
  res.json({
    object: "list",
    data: [
      {
        id: "claude-opus-4",
        object: "model",
        owned_by: "anthropic",
        created: Math.floor(Date.now() / 1000),
      },
      {
        id: "claude-sonnet-4",
        object: "model",
        owned_by: "anthropic",
        created: Math.floor(Date.now() / 1000),
      },
      {
        id: "claude-haiku-4",
        object: "model",
        owned_by: "anthropic",
        created: Math.floor(Date.now() / 1000),
      },
    ],
  });
}

/**
 * Handle GET /health
 */
export function handleHealth(_req: Request, res: Response): void {
  res.json({
    status: "ok",
    provider: "anthropic-oauth",
    timestamp: new Date().toISOString(),
  });
}
