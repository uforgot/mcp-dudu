# mcp-dudu

A standalone [Model Context Protocol](https://modelcontextprotocol.io/) server for Dudu task management. It connects Codex or Claude Code to an existing Dudu HTTP API; the `bb-todo` source code is not required on client machines.

## Safety boundaries

The server supports project, category, task, Today, Today Queue, and review operations. It intentionally does not expose tools for `done`, delete, archive, Queue start, or Queue stop. Agent-completed work moves to `review`; the user approves `done` in Dudu.

## Requirements

- Node.js 18 or newer
- Network access to the Dudu API
- A Dudu API key

## Configure

Create the default private environment file:

```bash
mkdir -p "$HOME/.config/mcp-dudu"
chmod 700 "$HOME/.config/mcp-dudu"
cat > "$HOME/.config/mcp-dudu/.env" <<'EOF'
DUDU_API_URL=https://your-dudu-api.example.com
DUDU_API_KEY=replace-with-your-api-key
EOF
chmod 600 "$HOME/.config/mcp-dudu/.env"
```

Use `DUDU_ENV_FILE` to load a different file. Existing process environment variables take precedence over values in the file.

## Codex

For the private GitHub repository, first make sure GitHub authentication works on the computer. Then register the package globally in Codex configuration:

```bash
codex mcp add mcp-dudu -- npx -y github:uforgot/mcp-dudu
```

After publishing to npm, the command can be shortened to `npx -y mcp-dudu`.

Verify:

```bash
codex mcp get mcp-dudu
codex mcp list
```

Remove:

```bash
codex mcp remove mcp-dudu
```

Restart open Codex sessions after changing MCP configuration.

## Claude Code

Register for the current user:

```bash
claude mcp add --scope user mcp-dudu -- npx -y github:uforgot/mcp-dudu
```

Verify:

```bash
claude mcp get mcp-dudu
claude mcp list
```

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

Run the local source through Codex:

```bash
codex mcp add mcp-dudu-dev -- npx tsx "$PWD/src/server.ts"
```

## Environment variables

- `DUDU_API_URL`: Dudu API base URL. Defaults to `http://localhost:3100`.
- `DUDU_API_KEY`: Bearer token for the API.
- `DUDU_ENV_FILE`: Optional env file path. Defaults to `~/.config/mcp-dudu/.env`.
- `USAGE_API_KEY`: Backward-compatible fallback for `DUDU_API_KEY`.
