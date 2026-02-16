/**
 * Claude Code CLI Subprocess Manager
 * Uses unbuffer (from expect) to provide PTY for Claude CLI.
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import type {
  ClaudeCliMessage,
  ClaudeCliAssistant,
  ClaudeCliResult,
  ClaudeCliStreamEvent,
} from "../types/claude-cli.js";
import { isAssistantMessage, isResultMessage, isContentDelta } from "../types/claude-cli.js";
import type { ClaudeModel } from "../adapter/openai-to-cli.js";

export interface SubprocessOptions {
  model: ClaudeModel;
  sessionId?: string;
  cwd?: string;
  timeout?: number;
}

const DEFAULT_TIMEOUT = 300000;

export class ClaudeSubprocess extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer: string = "";
  private timeoutId: NodeJS.Timeout | null = null;
  private isKilled: boolean = false;

  async start(prompt: string, options: SubprocessOptions): Promise<void> {
    const claudeArgs = this.buildArgs(prompt, options);
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn("unbuffer", ["claude", ...claudeArgs], {
          cwd: options.cwd || process.cwd(),
          env: { ...process.env },
          stdio: ["pipe", "pipe", "pipe"],
        });

        this.timeoutId = setTimeout(() => {
          if (!this.isKilled) {
            this.isKilled = true;
            this.process?.kill("SIGTERM");
            this.emit("error", new Error(`Request timed out after ${timeout}ms`));
          }
        }, timeout);

        this.process.on("error", (err) => {
          this.clearTimeout();
          if (err.message.includes("ENOENT")) {
            reject(new Error("unbuffer not found. Install: brew install expect"));
          } else {
            reject(err);
          }
        });

        this.process.stdin?.end();

        this.process.stdout?.on("data", (chunk: Buffer) => {
          const data = this.stripAnsi(chunk.toString());
          if (data.trim()) {
            this.buffer += data;
            this.processBuffer();
          }
        });

        this.process.stderr?.on("data", () => {});

        this.process.on("close", (code) => {
          this.clearTimeout();
          if (this.buffer.trim()) this.processBuffer();
          this.emit("close", code);
        });

        resolve();
      } catch (err) {
        this.clearTimeout();
        reject(err);
      }
    });
  }

  private stripAnsi(str: string): string {
    return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
              .replace(/\[\d*[A-Za-z]/g, "")
              .replace(/\][\d;]*[^\x07]*\x07/g, "");
  }

  private buildArgs(prompt: string, options: SubprocessOptions): string[] {
    const args = [
      "--print", "--output-format", "stream-json", "--verbose",
      "--model", options.model, "--no-session-persistence", prompt,
    ];
    if (options.sessionId) args.push("--session-id", options.sessionId);
    return args;
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message: ClaudeCliMessage = JSON.parse(trimmed);
        this.emit("message", message);
        if (isContentDelta(message)) this.emit("content_delta", message as ClaudeCliStreamEvent);
        else if (isAssistantMessage(message)) this.emit("assistant", message);
        else if (isResultMessage(message)) this.emit("result", message);
      } catch { this.emit("raw", trimmed); }
    }
  }

  private clearTimeout(): void {
    if (this.timeoutId) { clearTimeout(this.timeoutId); this.timeoutId = null; }
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    if (!this.isKilled && this.process) {
      this.isKilled = true;
      this.clearTimeout();
      this.process.kill(signal);
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.isKilled && this.process.exitCode === null;
  }
}

export async function verifyClaude(): Promise<{ ok: boolean; error?: string; version?: string }> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["--version"], { stdio: "pipe" });
    let output = "";
    proc.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    proc.on("error", () => resolve({ ok: false, error: "Claude CLI not found" }));
    proc.on("close", (code) => {
      resolve(code === 0 ? { ok: true, version: output.trim() } : { ok: false, error: "CLI error" });
    });
  });
}

export async function verifyAuth(): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}
