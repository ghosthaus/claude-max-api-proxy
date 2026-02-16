#!/usr/bin/env node
/**
 * Standalone server for Claude Max API Proxy
 * Uses OAuth credentials from Claude CLI to call Anthropic API directly
 */

import { startServer, stopServer } from "./index.js";
import { verifyCredentials } from "../anthropic/client.js";

const DEFAULT_PORT = 3456;

async function main(): Promise<void> {
  console.log("Claude Max API Proxy - Direct Anthropic API");
  console.log("============================================\n");

  // Parse port from command line
  const port = parseInt(process.argv[2] || String(DEFAULT_PORT), 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${process.argv[2]}`);
    process.exit(1);
  }

  // Verify OAuth credentials
  console.log("Checking Claude CLI credentials...");
  const authCheck = verifyCredentials();
  if (!authCheck.ok) {
    console.error(`Error: ${authCheck.error}`);
    console.error("Please run: claude auth login");
    process.exit(1);
  }
  
  const expiresIn = authCheck.expiresAt 
    ? Math.round((authCheck.expiresAt - Date.now()) / 1000 / 60)
    : "unknown";
  console.log(`  Credentials: OK (expires in ${expiresIn} minutes)\n`);

  // Start server
  try {
    await startServer({ port });
    console.log("\nServer ready. Test with:");
    console.log(`  curl -X POST http://localhost:${port}/v1/chat/completions \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"model": "claude-sonnet-4", "messages": [{"role": "user", "content": "Hello!"}]}'`);
    console.log("\nPress Ctrl+C to stop.\n");
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await stopServer();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
