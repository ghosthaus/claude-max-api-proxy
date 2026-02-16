# Claude Max API Proxy

An OpenAI-compatible API proxy that lets you use your **Claude Max subscription** ($20/month unlimited) with any tool that supports OpenAI's API format — including Clawdbot.

## How It Works

```
Your App/Clawdbot → This Proxy → Claude Code CLI → Claude Max API
                    (localhost)   (your subscription)
```

The proxy wraps the Claude Code CLI and exposes an OpenAI-compatible `/v1/chat/completions` endpoint.

## Prerequisites

1. **Claude Max subscription** ($20/month) — [claude.ai](https://claude.ai)
2. **Claude Code CLI** installed and authenticated
3. **expect** package (provides `unbuffer` command)
4. **Node.js 18+**

## Quick Install

### 1. Install Claude Code CLI
```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Authenticate Claude Code
```bash
claude
# Follow the prompts to log in with your Claude Max account
# Then exit with Ctrl+C
```

### 3. Install unbuffer (required for PTY)
```bash
# macOS
brew install expect

# Ubuntu/Debian
sudo apt install expect
```

### 4. Install and run the proxy
```bash
# Clone or download this repo
cd claude-max-api-proxy
npm install
npm start
```

The server will start at `http://localhost:3456`

## Usage

### Test it works
```bash
curl http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Available Models
- `claude-opus-4` — Most capable (reasoning-enabled)
- `claude-sonnet-4` — Balanced (default)
- `claude-haiku-4` — Fastest

## Clawdbot Integration

Add this to your Clawdbot config (`~/.clawdbot/config.yaml`):

```yaml
models:
  providers:
    claude-max:
      baseUrl: http://127.0.0.1:3456/v1
      apiKey: "local"  # Not used, but required
      api: openai-completions
      authHeader: false
      models:
        - id: claude-sonnet-4
          name: Claude Sonnet 4 (Max)
          contextWindow: 200000
          maxTokens: 8192
        - id: claude-opus-4
          name: Claude Opus 4 (Max)
          contextWindow: 200000
          maxTokens: 8192
          reasoning: true
```

Then set your agent to use `claude-max/claude-sonnet-4`.

## Running as a Background Service

### macOS (launchd)
```bash
# Create the plist
cat > ~/Library/LaunchAgents/com.claude-max-proxy.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude-max-proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/claude-max-api-proxy/dist/server/standalone.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/claude-max-proxy.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/claude-max-proxy.log</string>
</dict>
</plist>
EOF

# Load it
launchctl load ~/Library/LaunchAgents/com.claude-max-proxy.plist
```

### Linux (systemd)
```bash
# Create user service
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/claude-max-proxy.service << 'EOF'
[Unit]
Description=Claude Max API Proxy
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /path/to/claude-max-api-proxy/dist/server/standalone.js
Restart=always
Environment=PATH=/usr/bin:/usr/local/bin

[Install]
WantedBy=default.target
EOF

systemctl --user enable claude-max-proxy
systemctl --user start claude-max-proxy
```

## Troubleshooting

### "unbuffer not found"
Install expect: `brew install expect` (macOS) or `apt install expect` (Linux)

### "Claude CLI not found"
Install Claude Code: `npm install -g @anthropic-ai/claude-code`

### "Not logged in"
Run `claude` and complete the authentication flow.

### Proxy starts but requests fail
Check that Claude Code works directly:
```bash
unbuffer claude --print --model sonnet "Hello"
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completion (OpenAI format) |

## License

MIT
