# Claude Max API Proxy

An OpenAI-compatible API proxy that lets you use your **Claude Max subscription** ($20/month unlimited) with any tool that supports OpenAI's API format — including Clawdbot.

## How It Works

```
Your App/Clawdbot → This Proxy → Claude Code CLI → Claude Max API
                    (localhost)   (your subscription)
```

## Prerequisites

1. **Claude Max subscription** ($20/month) — [claude.ai](https://claude.ai)
2. **Claude Code CLI** installed and authenticated
3. **expect** package (provides `unbuffer` command)
4. **Node.js 18+**

## Quick Install

```bash
# 1. Install prerequisites
brew install expect                           # macOS
npm install -g @anthropic-ai/claude-code

# 2. Authenticate Claude Code (one time)
claude    # Sign in with Google, then Ctrl+C

# 3. Clone and install
git clone https://github.com/ghosthaus/claude-max-api-proxy.git
cd claude-max-api-proxy
npm install
npm run build

# 4. Run
npm start
```

Server runs at `http://localhost:3456`

## Test It

```bash
curl http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Available Models

| Model | Description |
|-------|-------------|
| `claude-opus-4` | Most capable (default) |
| `claude-sonnet-4` | Balanced |
| `claude-haiku-4` | Fastest |

## Clawdbot Integration

Add to `~/.clawdbot/config.yaml`:

```yaml
models:
  providers:
    claude-max:
      baseUrl: http://127.0.0.1:3456/v1
      apiKey: "local"
      api: openai-completions
      authHeader: false
      models:
        - id: claude-opus-4
          name: Claude Opus 4 (Max)
          contextWindow: 200000
          maxTokens: 8192
          reasoning: true
        - id: claude-sonnet-4
          name: Claude Sonnet 4 (Max)
          contextWindow: 200000
          maxTokens: 8192
```

Then set your agent model to `claude-max/claude-opus-4`.

## Run on Startup (macOS)

```bash
cat > ~/Library/LaunchAgents/com.claude-max-proxy.plist << 'PLIST'
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
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
PLIST

launchctl load ~/Library/LaunchAgents/com.claude-max-proxy.plist
```

## License

MIT
