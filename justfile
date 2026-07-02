set shell := ["bash", "-euo", "pipefail", "-c"]

# List available recipes.
default:
    @just --list

# Install dependencies.
install:
    bun install

# Compile the TypeScript entry points.
build:
    bun run build

# Run all static verification.
check:
    bun run typecheck
    bun run lint
    bun run build

# Authenticate with Spotify.
auth:
    bun run auth

# Run the local stdio MCP server.
spotify-mcp-stdio:
    bun run build
    exec node build/index.js

# Run the native Streamable HTTP MCP server.
spotify-mcp-http port="8001" host="127.0.0.1":
    bun run build
    exec env PORT="{{ port }}" HOST="{{ host }}" node build/http.js

# Expose the native Streamable HTTP server through ngrok.
spotify-mcp-ngrok port="8001":
    #!/usr/bin/env bash
    set -euo pipefail

    if ! command -v ngrok >/dev/null 2>&1; then
        echo "ngrok is required."
        exit 1
    fi

    exec ngrok http "{{ port }}"

# Verify that the HTTP server is healthy.
spotify-mcp-health port="8001":
    curl \
        --fail \
        --silent \
        --show-error \
        "http://127.0.0.1:{{ port }}/healthz"

# Send the same MCP initialise shape used by ChatGPT.
spotify-mcp-initialize port="8001":
    curl \
        --fail-with-body \
        --include \
        --request POST \
        --header "Content-Type: application/json" \
        --header "Accept: application/json, text/event-stream" \
        --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","clientInfo":{"name":"openai-mcp","version":"1.0.0"},"capabilities":{"experimental":{"openai/visibility":{"enabled":true}},"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}}}}' \
        "http://127.0.0.1:{{ port }}/mcp"

# Copy selected project files using the existing local helper.
clf:
    python3 ./scripts/copy-files.py
