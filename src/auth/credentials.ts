/**
 * Read credentials from Clawdbot's auth store or Claude CLI
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const CLAWDBOT_AUTH_STORE = ".clawdbot/agents/main/agent/auth-profiles.json";
const KEYCHAIN_SERVICE = "Claude Code-credentials";

export interface Credentials {
  accessToken: string;
  expiresAt?: number;
}

/**
 * Read from Clawdbot's auth store (preferred - tokens are managed/refreshed)
 */
function readFromClawdbot(): Credentials | null {
  try {
    const storePath = path.join(os.homedir(), CLAWDBOT_AUTH_STORE);
    const raw = fs.readFileSync(storePath, "utf8");
    const data = JSON.parse(raw);
    
    // Try anthropic:default (token type, no expiry management needed)
    const defaultProfile = data?.profiles?.["anthropic:default"];
    if (defaultProfile?.type === "token" && defaultProfile?.token) {
      console.log("[Auth] Using token from Clawdbot (anthropic:default)");
      return {
        accessToken: defaultProfile.token,
        expiresAt: undefined, // Token type doesn't track expiry
      };
    }

    // Try anthropic:claude-cli (oauth type)
    const cliProfile = data?.profiles?.["anthropic:claude-cli"];
    if (cliProfile?.type === "oauth" && cliProfile?.access) {
      console.log("[Auth] Using OAuth from Clawdbot (anthropic:claude-cli)");
      return {
        accessToken: cliProfile.access,
        expiresAt: cliProfile.expires,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Read credentials from macOS Keychain (fallback)
 */
function readFromKeychain(): Credentials | null {
  if (process.platform !== "darwin") {
    return null;
  }

  try {
    const result = execSync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE}" -w`,
      { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
    );
    
    const data = JSON.parse(result.trim());
    const claudeOauth = data?.claudeAiOauth;
    
    if (!claudeOauth?.accessToken) {
      return null;
    }

    console.log("[Auth] Using credentials from Keychain");
    return {
      accessToken: claudeOauth.accessToken,
      expiresAt: claudeOauth.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Get credentials (Clawdbot first, then Keychain)
 */
export function getCredentials(): Credentials | null {
  // Try Clawdbot's managed auth store first
  const clawdbotCreds = readFromClawdbot();
  if (clawdbotCreds) {
    return clawdbotCreds;
  }

  // Fall back to Keychain
  return readFromKeychain();
}

/**
 * Check if credentials are still valid
 */
export function isValid(creds: Credentials): boolean {
  // If no expiry tracked (token type), assume valid
  if (!creds.expiresAt) {
    return true;
  }
  // Add 5 minute buffer
  return creds.expiresAt > Date.now() + 5 * 60 * 1000;
}
