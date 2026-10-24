# IndustriConnect

The IndustriConnect MCP Manager: a web console for talking to industrial MCP servers through a cloud or local language model. Built with React and TypeScript.

## Features

- 🖥️ **Operator console** – A transcript of commands and answers, with every tool call and its result shown under the answer it produced
- 🌓 **Dark/Light Mode** – Seamless theme switching with system preference detection
- 🔌 **MCP Server Integration** – Connect and manage Model Context Protocol servers (MQTT, OPC UA, Modbus, etc.)
- ☁️ **Cloud LLM Support** – Talk to OpenAI, Google Gemini, and Anthropic Claude
- 💻 **Local LLM Support (Ollama)** – Chat with local models running via Ollama
- 🛠️ **Tool calling** – The model calls tools on the connected servers, reads the results, and answers in plain language
- 💾 **Local Storage** – Remembers your servers, chosen model and theme between visits. Provider API keys entered in the model dialog are kept only in memory

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Python (for running MCP servers like MQTT/OPC UA)
- `uv` (Python package manager)

### Installation

1. Install dependencies (including backend):
   ```bash
   npm install
   cd mcp-backend && npm install && cd ..
   ```

### Running the Application

Start both the frontend UI and the backend service with a single command:

```bash
PORT=3003 npm run dev
```

This will start:
- Frontend UI at http://localhost:3000
- `mcp-backend`, serving HTTP and WebSocket on one port, at http://localhost:3003

Keep `PORT=3003`: the UI looks for the backend at `ws://localhost:3003`.
Without it the backend listens on its default port, 3000, which the UI itself
uses, and **Connect** fails. In PowerShell, run `$env:PORT=3003; npm run dev`
instead.

## Usage

1. **Configure MCP Servers**
   - Click **+** next to "Active nodes" in the sidebar, or **Server configuration**
   - Option 1: Use the form to add servers manually
   - Option 2: Import a Cursor-style JSON configuration file
   - Option 3: Use JSON editor mode to paste configuration directly
   - Example configuration available in `mcp-config-example.json`. Replace
     `/absolute/path/to/IndustriConnect` with the path to your clone of the
     IndustriConnect repository, cloned with `--recurse-submodules` so the
     protocol folders are populated

2. **Connect to MCP Servers**
   - Keep the backend running (`PORT=3003 npm run dev` starts it). It launches each configured server over stdio when you connect, so you do not start the servers yourself
   - Click a server in the sidebar to connect it, and click it again to disconnect
   - Connected servers show a green dot, and the top bar counts how many are live

3. **Choose a Model**
   - Click the model button in the top bar. It reads **Choose a model** until one is set, and is dashed while a cloud model still needs an API key
   - **Cloud**: pick OpenAI, Gemini or Anthropic and enter a model id. The field suggests a few, but takes any id the provider serves. For OpenAI you can also set a base URL, for any server that speaks the OpenAI chat API
   - Provide the API key either:
     - via `.env` file (`VITE_OPENAI_API_KEY`, `VITE_GEMINI_API_KEY`, `VITE_ANTHROPIC_API_KEY`), or
     - in the dialog. A key typed there stays in memory for that tab only and is never written to the browser's storage
   - **Local · Ollama**: ensure Ollama is running (default: `http://localhost:11434`), then pick one of its models. **Refresh** lists them again after you change the URL or pull a new model
   - Tool calling needs a model that supports tools. Give a local model enough context for the full tool list: with Ollama's default context window, the tool definitions of several connected servers can be cut short and the model will not see some tools

4. **Start Chatting**
   - Type your message in the input box
   - Press `Enter` to send, `Shift+Enter` for a new line
   - The model may call several tools, up to eight rounds per message, before it answers. Each call and its result is listed under the answer, and a failed call is marked **DENIED / FAILED**

Requests to cloud providers go straight from the browser to the provider (or
the configured OpenAI-compatible base URL). `VITE_*` values are embedded in the
frontend bundle: use environment keys only for a private local setup, and enter
keys in the dialog when sharing a build. MCP server configuration, including
any environment variables in it, is saved in browser storage.

For
Claude Fable 5.1, Claude Opus 5.5, Claude Opus 5 and Claude Sonnet 5.5 the
request opts into [Anthropic’s server-side fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback)
(`fallbacks: "default"`). If the refusal category has a recommended fallback,
the API retries there; categories without a recommended fallback remain refused.

## Project Structure

```
mcp-manager-ui/
├── src/
│   ├── components/
│   │   ├── IndustrialUI.tsx    # The console: sidebar, top bar, transcript, composer
│   │   ├── ModelSettings.tsx   # Model dialog (cloud provider or Ollama)
│   │   ├── MCPServerConfig.tsx # Server configuration dialog
│   │   ├── Icons.tsx           # Inline stroke icons
│   │   └── ThemeProvider.tsx   # Theme context provider
│   ├── types.ts               # Chat and LLM configuration types
│   ├── types/mcp-types.ts     # MCP server, tool and tool-call types
│   ├── utils/
│   │   ├── llm.ts             # Cloud/Ollama calls and the tool-calling loop
│   │   ├── mcp-client.ts      # WebSocket client for mcp-backend
│   │   ├── mcp-storage.ts     # Server configuration in localStorage
│   │   ├── storage.ts         # Chat backend and model settings in localStorage
│   │   └── theme.ts           # Theme management
│   ├── App.tsx            # Main application component
│   └── main.tsx           # Entry point
├── mcp-backend/           # Node service that runs the MCP servers over stdio
├── index.html
├── package.json
└── vite.config.ts
```

## Future Enhancements

- [ ] Streaming responses
- [ ] Per-session message history persistence
- [ ] Command/Prompt templates
- [ ] Multi-tab support for multiple sessions

## License

ISC
