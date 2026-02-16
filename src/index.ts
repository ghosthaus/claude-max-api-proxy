/**
 * Claude Max API Proxy
 *
 * OpenAI-compatible API proxy that uses Claude Max subscription
 * via OAuth authentication.
 */

export { startServer, stopServer, getServer } from "./server/index.js";
export { verifyCredentials } from "./anthropic/client.js";
export { getCredentials, isValid } from "./auth/credentials.js";
