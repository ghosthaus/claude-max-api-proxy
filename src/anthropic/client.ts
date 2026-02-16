/**
 * Direct Anthropic API client using OAuth credentials
 */

import { getCredentials, isValid, Credentials } from "../auth/credentials.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const CLAUDE_CODE_VERSION = "2.1.42";

// Headers required for OAuth token authentication (mimics Claude Code CLI)
const OAUTH_HEADERS = {
  "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
  "user-agent": `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
  "x-app": "cli",
  "anthropic-dangerous-direct-browser-access": "true",
};

/**
 * Check if token is OAuth (sk-ant-oat prefix)
 */
function isOAuthToken(token: string): boolean {
  return token.includes("sk-ant-oat");
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  stream?: boolean;
}

export interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{ type: "text"; text: string }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Model mapping
const MODEL_MAP: Record<string, string> = {
  "claude-opus-4": "claude-opus-4-20250514",
  "claude-sonnet-4": "claude-sonnet-4-20250514",
  "claude-haiku-4": "claude-haiku-4-20250514",
  "opus": "claude-opus-4-20250514",
  "sonnet": "claude-sonnet-4-20250514",
  "haiku": "claude-haiku-4-20250514",
};

function resolveModel(model: string): string {
  return MODEL_MAP[model] || model;
}

let cachedCreds: Credentials | null = null;

function getValidCredentials(): Credentials {
  if (cachedCreds && isValid(cachedCreds)) {
    return cachedCreds;
  }

  const creds = getCredentials();
  if (!creds) {
    throw new Error("No Claude CLI credentials found. Run: claude auth login");
  }
  if (!isValid(creds)) {
    throw new Error("Claude CLI credentials expired. Run: claude auth login");
  }

  cachedCreds = creds;
  return creds;
}

/**
 * Build headers for API request
 */
function buildHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": ANTHROPIC_API_VERSION,
  };

  if (isOAuthToken(token)) {
    // OAuth token - use special headers and auth method
    Object.assign(headers, OAUTH_HEADERS);
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    // Regular API key
    headers["x-api-key"] = token;
  }

  return headers;
}

/**
 * Build request body, adding Claude Code system prompt for OAuth
 */
function buildBody(request: AnthropicRequest, token: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: resolveModel(request.model),
    messages: request.messages,
    max_tokens: request.max_tokens || 8192,
  };

  // For OAuth tokens, we must include Claude Code identity in system prompt
  if (isOAuthToken(token)) {
    const systemParts = [
      { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude.", cache_control: { type: "ephemeral" } }
    ];
    if (request.system) {
      systemParts.push({ type: "text", text: request.system, cache_control: { type: "ephemeral" } });
    }
    body.system = systemParts;
  } else if (request.system) {
    body.system = request.system;
  }

  return body;
}

/**
 * Call Anthropic API (non-streaming)
 */
export async function callAnthropic(request: AnthropicRequest): Promise<AnthropicResponse> {
  const creds = getValidCredentials();
  const headers = buildHeaders(creds.accessToken);
  const body = buildBody(request, creds.accessToken);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  return response.json() as Promise<AnthropicResponse>;
}

/**
 * Call Anthropic API (streaming)
 */
export async function callAnthropicStream(
  request: AnthropicRequest,
  onChunk: (text: string) => void,
  onDone: (response: { model: string; inputTokens: number; outputTokens: number }) => void
): Promise<void> {
  const creds = getValidCredentials();
  const headers = buildHeaders(creds.accessToken);
  const body = buildBody(request, creds.accessToken);
  body.stream = true;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let model = request.model;
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const event = JSON.parse(data);
        
        if (event.type === "message_start") {
          model = event.message?.model || model;
          inputTokens = event.message?.usage?.input_tokens || 0;
        } else if (event.type === "content_block_delta") {
          const text = event.delta?.text;
          if (text) onChunk(text);
        } else if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens || 0;
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }

  onDone({ model, inputTokens, outputTokens });
}

/**
 * Verify credentials are available and valid
 */
export function verifyCredentials(): { ok: boolean; error?: string; expiresAt?: number } {
  try {
    const creds = getCredentials();
    if (!creds) {
      return { ok: false, error: "No credentials found" };
    }
    if (!isValid(creds)) {
      return { ok: false, error: "Credentials expired" };
    }
    return { ok: true, expiresAt: creds.expiresAt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
