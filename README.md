# Claude Max API Proxy

**Use your Claude Max subscription ($20/mo) with any OpenAI-compatible client.**

This proxy lets you use Agent Zero, Open WebUI, or any tool that speaks the OpenAI API format with Claude's unlimited Max subscription instead of paying per-token API costs.

## How It Works

```
Your App → Proxy (localhost:3456) → Anthropic API
           (OpenAI format)           (OAuth token)
```

The proxy:
1. Reads your OAuth token from Claude CLI credentials
2. Translates OpenAI format requests to Anthropic format  
3. Adds required headers to authenticate with your Max subscription
4. Returns responses in OpenAI format

## Prerequisites

- **Node.js 18+** 
- **Claude CLI** installed and authenticated with Claude Max
  ```bash
  # Install Claude CLI
  npm install -g @anthropic-ai/claude-code
  
  # Login with your Max subscription
  claude auth login
  ```

## Installation

```bash
# Clone the repo
git clone https://github.com/ghosthaus/claude-max-api-proxy.git
cd claude-max-api-proxy

# Install dependencies
npm install

# Build
npm run build

# Run
npm start
```

The server starts on `http://localhost:3456`.

## Quick Test

```bash
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Available Models

| Model ID | Description |
|----------|-------------|
| `claude-opus-4` | Most capable, best for complex tasks |
| `claude-sonnet-4` | Balanced speed and capability |
| `claude-haiku-4` | Fastest, best for simple tasks |

## Usage with Agent Zero

1. Start the proxy: `npm start`

2. Configure A0's model settings:
   ```
   Provider: openai
   API Base: http://host.docker.internal:3456/v1  (if A0 runs in Docker)
             http://localhost:3456/v1              (if A0 runs locally)
   Model: claude-opus-4
   API Key: anything  (not used, but required by A0)
   ```

3. Optional: Add to A0's provider config:
   ```
   timeout=120
   max_retries=1
   ```

## Usage with Open WebUI

1. Start the proxy: `npm start`

2. In Open WebUI settings, add a new OpenAI-compatible provider:
   - API Base: `http://localhost:3456/v1`
   - API Key: `not-used`
   - Models: `claude-opus-4`, `claude-sonnet-4`, `claude-haiku-4`

## Run as macOS Service (LaunchAgent)

To run the proxy automatically on boot:

```bash
# Create LaunchAgent
cat > ~/Library/LaunchAgents/com.claude-max-proxy.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude-max-proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>$HOME/claude-max-api-proxy/dist/server/standalone.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/claude-max-proxy.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/claude-max-proxy.log</string>
    <key>WorkingDirectory</key>
    <string>$HOME/claude-max-api-proxy</string>
</dict>
</plist>
EOF

# Replace $HOME with actual path
sed -i '' "s|\$HOME|$HOME|g" ~/Library/LaunchAgents/com.claude-max-proxy.plist

# Load the service
launchctl load ~/Library/LaunchAgents/com.claude-max-proxy.plist

# Check logs
tail -f /tmp/claude-max-proxy.log
```

**Service commands:**
```bash
# Start
launchctl start com.claude-max-proxy

# Stop  
launchctl stop com.claude-max-proxy

# Restart
launchctl stop com.claude-max-proxy && launchctl start com.claude-max-proxy

# View logs
tail -f /tmp/claude-max-proxy.log
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completion (streaming & non-streaming) |

## How Authentication Works

The proxy reads your Claude CLI OAuth credentials from:
1. **Clawdbot auth store** (if you use Clawdbot): `~/.clawdbot/agents/main/agent/auth-profiles.json`
2. **macOS Keychain**: `Claude Code-credentials`

OAuth tokens (prefixed `sk-ant-oat-`) require special headers that the proxy handles automatically:
- `anthropic-beta: claude-code-20250219,oauth-2025-04-20`
- `user-agent: claude-cli/2.x.x (external, cli)`

## Troubleshooting

### "Credentials expired"
Run `claude auth login` to refresh your Claude CLI authentication.

### "OAuth authentication not supported"
Make sure you're using Claude CLI version 2.x+ and have authenticated with `claude auth login`.

### A0 stuck in retry loop
Add these settings to your A0 provider config:
```
timeout=120
max_retries=1
```

### Connection refused
Make sure the proxy is running: `npm start` or check LaunchAgent logs.

## License

MIT

## Credits

Built by [Ghost Works](https://ghostworks.dev) for use with Agent Zero and other AI tools.
