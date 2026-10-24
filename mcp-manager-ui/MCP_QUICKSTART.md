# MCP Server Integration Quick Start

This guide helps you quickly get started with MCP (Model Context Protocol) server integration in IndustriConnect.

## What is MCP?

MCP (Model Context Protocol) allows LLMs to interact with external systems through "tools". For example, an MQTT MCP server provides tools to publish/subscribe to MQTT topics, while an OPC UA MCP server provides tools to read/write PLC data.

## Quick Setup

### 1. Configure Your MCP Servers

The paths below use `/absolute/path/to/IndustriConnect` as a placeholder for
your clone of the IndustriConnect repository. Replace it with the real path,
here and in `mcp-config-example.json`. Clone with `--recurse-submodules`,
because the protocol folders are git submodules (see the root `README.md`).

You have three options:

**Option A: Import from File**
1. Click **+** next to **Active nodes**, or **Server configuration** in the sidebar
2. Click **Import**
3. Select `mcp-config-example.json` from this directory

**Option B: Import from JSON**
1. Open **Server configuration**
2. Switch to the **JSON** tab
3. Paste the example configuration from `mcp-config-example.json`
4. Click **Apply configuration**

**Option C: Manual Form Entry**
1. Open **Server configuration**
2. Fill in the form:
   - **Server Name**: `MQTT MCP (Python)`
   - **Command**: `uv`
   - **Arguments** (one per line):
     ```
     --directory
     /absolute/path/to/IndustriConnect/MQTT-Project/mqtt-python
     run
     mqtt-mcp
     ```
   - **Environment Variables**:
     ```json
     {
       "MQTT_BROKER_URL": "mqtt://127.0.0.1:1883",
       "MQTT_CLIENT_ID": "mqtt-mcp-cursor"
     }
     ```
3. Click **Add server**

### 2. Start the UI and Its Backend

```bash
cd mcp-manager-ui
npm install
(cd mcp-backend && npm install)   # the backend has its own dependencies
PORT=3003 npm run dev
```

The browser cannot start processes itself, so this also starts `mcp-backend`.
When you click a configured server in the sidebar, the backend launches it over stdio with the
command, arguments and environment from your configuration. You do not start
the MCP servers yourself. The UI opens at http://localhost:3000.

Keep `PORT=3003`: the UI looks for the backend at `ws://localhost:3003`.
Without it the backend listens on its default port, 3000, which the UI itself
uses, and server connections fail. In PowerShell, run `$env:PORT=3003; npm run dev`
instead.

Check that each command works from a terminal first. It should start and then
wait for an MCP client on stdin. Stop it with Ctrl+C.

For the MQTT MCP server:
```bash
cd /absolute/path/to/IndustriConnect/MQTT-Project/mqtt-python
uv run mqtt-mcp
```

For the OPC UA MCP server:
```bash
cd /absolute/path/to/IndustriConnect/OPCUA-Project/packages/server-python
uv run opcua-mcp-server
```

The servers also need something to talk to. For local testing, start a broker
(such as `mosquitto -p 1883`) in a separate terminal, then run
`uv run mqtt-mock-server` in `MQTT-Project/mqtt-mock-server` to publish Sparkplug
data to it. The MQTT mock does not include a broker. For OPC UA, run
`uv run opcua-mock-server` in `OPCUA-Project/packages/mock-server`.

### 3. Connect in the UI

1. Under **Active nodes**, click your server to connect
2. Wait for its status dot to turn green
3. Click the model button in the top bar to configure a cloud provider or Ollama
4. Click the server again when you want to disconnect

### 4. Use MCP Tools in Chat

Once connected, you can reference MCP capabilities in your chat:
- "List all available MCP tools"
- "Publish 'hello world' to MQTT topic 'test'"
- "Read the temperature value from OPC UA mock node ns=2;i=3"

## Current Implementation Status

✅ **Implemented:**
- MCP server configuration UI (form & JSON)
- Import/Export Cursor-style configuration
- Server connection management through `mcp-backend`, which spawns each server over stdio and relays it to the browser over WebSocket
- Automatic tool discovery and display of tool calls and their results
- Tool calls from the LLM (OpenAI, Gemini, Anthropic and Ollama), executed on the real server
- Persistent configuration storage

## Troubleshooting

**Server won't connect:**
- Ensure `mcp-backend` is running on port 3003: `curl http://localhost:3003/health`
  should answer `{"status":"ok","service":"mcp-backend"}`. If it does not, start
  the UI with `PORT=3003 npm run dev`, which starts the backend alongside it
- Check that paths in configuration are correct, and that the command runs from a terminal
- Verify environment variables are set properly

**No tools showing:**
- Make sure the server status is "connected" (green)
- Ask the selected model which tools it can use; calls and results appear in the transcript
- Check browser console for errors

**Configuration not saving:**
- Check browser localStorage is enabled
- Try exporting and re-importing the configuration

## Example Configuration Format

The configuration follows Cursor IDE's format:

```json
{
  "mcpServers": {
    "Server Name": {
      "command": "executable_name",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

For more examples, see `mcp-config-example.json`.
