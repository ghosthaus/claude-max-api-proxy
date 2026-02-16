#!/bin/bash
# Claude Max API Proxy - Quick Install Script

set -e

echo "Claude Max API Proxy - Installer"
echo "================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    echo "   https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Found: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check unbuffer
if ! command -v unbuffer &> /dev/null; then
    echo "❌ unbuffer not found."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "   Install with: brew install expect"
    else
        echo "   Install with: sudo apt install expect"
    fi
    exit 1
fi
echo "✅ unbuffer (expect)"

# Check Claude CLI
if ! command -v claude &> /dev/null; then
    echo "❌ Claude Code CLI not found."
    echo "   Install with: npm install -g @anthropic-ai/claude-code"
    exit 1
fi
echo "✅ Claude Code CLI $(claude --version 2>/dev/null | head -1)"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install --production

# Build
echo "Building..."
npm run build

echo ""
echo "✅ Installation complete!"
echo ""
echo "To start the proxy:"
echo "  npm start"
echo ""
echo "Or run directly:"
echo "  node dist/server/standalone.js"
echo ""
echo "The proxy will be available at http://localhost:3456"
