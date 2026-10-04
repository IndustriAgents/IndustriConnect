# IndustriConnect MCP Suite

[![License: MIT](https://img.shields.io/github/license/IndustriAgents/IndustriConnect)](LICENSE)
[![MCP](https://img.shields.io/badge/Model_Context_Protocol-server_suite-0b7285)](https://modelcontextprotocol.io)
[![Protocols](https://img.shields.io/badge/protocols-10-4c6ef5)](#repository-layout)

A collection of Model Context Protocol (MCP) servers and tools for industrial automation protocols. The suite lets AI assistants and other MCP‑compatible clients talk to real (or simulated) PLCs and control systems using familiar protocols like Modbus, MQTT/Sparkplug B, OPC UA, BACnet, DNP3, EtherCAT, EtherNet/IP, PROFIBUS, PROFINET, and Siemens S7 (S7comm).

This repository brings the suite together. Each protocol server is developed in its own repository under [IndustriAgents](https://github.com/IndustriAgents) and pinned here as a git submodule, alongside `mcp-manager-ui` and the whitepaper.

<img width="1456" height="774" alt="Screenshot 2025-12-08 at 21 32 53" src="https://github.com/user-attachments/assets/de160a10-9def-466c-a679-7c6f08fe91d1" />


All protocol stacks follow the same pattern:

- A Python MCP server that exposes a consistent set of tools over stdio
- A mock device/server that simulates a realistic industrial process for safe local testing
- A shared response envelope: `{ success, data, error, meta }`

The `mcp-manager-ui` project adds a web UI for working with these servers and other MCP backends from a single place.

---

## Repository Layout

Top‑level structure:

```text
IndustriConnect/
├── BACnet-Project/      # submodule -> IndustriAgents/BACnet-MCP
├── DNP3-Project/        # submodule -> IndustriAgents/DNP3-MCP
├── EtherCAT-Project/    # submodule -> IndustriAgents/EtherCAT-MCP
├── EtherNetIP-Project/  # submodule -> IndustriAgents/EtherNetIP-MCP
├── MODBUS-Project/      # submodule -> IndustriAgents/MODBUS-MCP
├── MQTT-Project/        # submodule -> IndustriAgents/MQTT-MCP
├── OPCUA-Project/       # submodule -> IndustriAgents/OPCUA-MCP
├── PROFIBUS-Project/    # submodule -> IndustriAgents/PROFIBUS-MCP
├── PROFINET-Project/    # submodule -> IndustriAgents/PROFINET-MCP
├── S7comm-Project/      # submodule -> IndustriAgents/S7comm-MCP
├── mcp-manager-ui/      # Web UI for managing MCP servers and LLMs
└── whitepaper/          # Architecture and design background
```

Every `*-Project/` folder is a git submodule, so it stays empty until you
initialise it. The cloning note under
[Quick Start](#quick-start-example-modbus) explains how. Each submodule tracks
the `main` branch of its repository. Every night the
[Sync protocol submodules](.github/workflows/sync-submodules.yml) workflow
opens or updates one pull request that moves the pins forward. A protocol
repository that sends a `protocol-mcp-updated` dispatch when its `main` moves
gets picked up straight away.

Each protocol repository has:

- `*-python/` – Python MCP server (`uv` + `mcp[cli]` or FastMCP)
- `*-mock-*` – Mock device or server that simulates a plant/process
- `README.md` – Protocol‑specific docs and quickstart

OPC UA is laid out differently. `OPCUA-Project/` keeps everything under
`packages/`: `server-python`, `server-node`, `mock-server` and a few
specialised mocks. Its README covers all of them.

> Note: The suite is Python‑first, with a consistent layout and tooling across all protocols. Earlier TypeScript/Node implementations have been removed, except for OPC UA's `packages/server-node`, which serves the same tool contract as its Python counterpart.

---

## What Is MCP and Why Here?

The Model Context Protocol (MCP) is a simple, transport‑agnostic way to expose tools and data sources to AI assistants over stdio. In this suite, MCP servers act as protocol‑aware “gateways” between an assistant and industrial systems:

- MCP client (e.g., Claude Desktop, mcp-manager-ui, or another MCP runner)
- ↔ MCP server (e.g., Modbus, OPC UA, S7comm)
- ↔ Industrial device / mock device

This separation keeps:

- **Industrial protocol logic** in focused Python projects
- **Conversation and UX** in clients like Claude or `mcp-manager-ui`

You can safely develop and test flows against mocks before connecting to real PLCs or field devices.

---

## Projects Overview

High‑level summary of each protocol project, with the repository it is developed in:

- `MODBUS-Project/` — git submodule tracking [IndustriAgents/MODBUS-MCP](https://github.com/IndustriAgents/MODBUS-MCP)
  - **modbus-python** – Modbus TCP/UDP/RTU client wrapped as an MCP server
  - **modbus-mock-server** – Mock Modbus TCP device with a realistic register map
- `MQTT-Project/` — git submodule tracking [IndustriAgents/MQTT-MCP](https://github.com/IndustriAgents/MQTT-MCP)
  - **mqtt-python** – MQTT + Sparkplug B MCP server (publish, subscribe, Sparkplug lifecycle)
  - **mqtt-mock-server** – Mock MQTT broker + Sparkplug edge nodes
- `OPCUA-Project/` — git submodule tracking [IndustriAgents/OPCUA-MCP](https://github.com/IndustriAgents/OPCUA-MCP)
  - **packages/server-python** – OPC UA MCP server (read/write nodes, browse, methods, bulk operations)
  - **packages/server-node** – the same tool contract on Node, published to npm
  - **packages/mock-server** – Rich mock OPC UA server simulating an industrial plant
- `BACnet-Project/` — git submodule tracking [IndustriAgents/BACnet-MCP](https://github.com/IndustriAgents/BACnet-MCP)
  - **bacnet-python** – BACnet/IP MCP server
  - **bacnet-mock-device** – Mock BACnet device for discovery and property access tests
- `DNP3-Project/` — git submodule tracking [IndustriAgents/DNP3-MCP](https://github.com/IndustriAgents/DNP3-MCP)
  - **dnp3-python** – DNP3 master MCP server
  - **dnp3-mock-outstation** – Mock DNP3 outstation
- `EtherCAT-Project/` — git submodule tracking [IndustriAgents/EtherCAT-MCP](https://github.com/IndustriAgents/EtherCAT-MCP)
  - **ethercat-python** – EtherCAT MCP server (PySOEM‑based)
  - **ethercat-mock-slave** – Mock EtherCAT slave for local smoke tests
- `EtherNetIP-Project/` — git submodule tracking [IndustriAgents/EtherNetIP-MCP](https://github.com/IndustriAgents/EtherNetIP-MCP)
  - **ethernetip-python** – EtherNet/IP MCP server (Rockwell/AB controllers)
  - **ethernetip-mock-server** – Mock CIP server with representative tags/UDTs
- `PROFIBUS-Project/` — git submodule tracking [IndustriAgents/PROFIBUS-MCP](https://github.com/IndustriAgents/PROFIBUS-MCP)
  - **profibus-python** – PROFIBUS DP/PA MCP server
  - **profibus-mock-slave** – Mock PROFIBUS slave
- `PROFINET-Project/` — git submodule tracking [IndustriAgents/PROFINET-MCP](https://github.com/IndustriAgents/PROFINET-MCP)
  - **profinet-python** – PROFINET MCP server
  - **profinet-mock-server** – Mock PROFINET IO device
- `S7comm-Project/` — git submodule tracking [IndustriAgents/S7comm-MCP](https://github.com/IndustriAgents/S7comm-MCP)
  - **s7comm-python** – Siemens S7 (S7comm) MCP server using `python-snap7`
  - **s7comm-mock-server** – Mock Siemens PLC for DB/I/O/SZL testing
- `mcp-manager-ui/`
  - React + TypeScript web UI for:
    - Connecting to multiple local/remote MCP servers
    - Chatting with LLMs using those tools
    - Inspecting tool schemas and responses

For details and protocol‑specific examples, open the `README.md` in each project directory, or on the project's repository.

---

## Common Design Patterns

Across all protocol servers:

- **Transport**: stdio MCP servers, usually run via `uv run <entrypoint>`
- **Config**: environment variables and optional `.env` files (e.g., host, port, timeouts)
- **Envelope**: tools return a consistent shape:

  ```json
  {
    "success": true,
    "data": { "...": "protocol-specific payload" },
    "error": null,
    "meta": { "latency_ms": 12, "raw": {} }
  }
  ```

- **Mocks first**: every stack ships with a mock device/server so you can:
  - Develop prompts and workflows safely
  - Debug tools without needing access to production hardware
  - Reproduce issues deterministically

---

## Quick Start (Example: Modbus)

> **Cloning:** every `*-Project/` folder is a git submodule. Clone with
> `git clone --recurse-submodules https://github.com/IndustriAgents/IndustriConnect.git`,
> or run `git submodule update --init --recursive` in an existing clone.
> To move every protocol server to the latest `main` of its repository, run
> `git submodule update --remote`. To move just one, name it, for example
> `git submodule update --remote MODBUS-Project`. Running `git submodule update`
> without `--remote` returns them to the commits this repository pins.

1. **Start the Modbus mock device**

   ```bash
   cd MODBUS-Project/modbus-mock-server
   uv sync
   uv run modbus-mock-server  # listens on 0.0.0.0:1502
   ```

2. **Run the Modbus MCP server**

   ```bash
   cd ../modbus-python
   export MODBUS_TYPE=tcp
   export MODBUS_HOST=127.0.0.1
   export MODBUS_PORT=1502
   export MODBUS_DEFAULT_SLAVE_ID=1
   uv sync
   uv run modbus-mcp
   ```

3. **Wire it into Claude Desktop (or another MCP client)**

   Example `claude_desktop_config.json` snippet:

   ```json
   {
     "mcpServers": {
       "Modbus MCP (Python)": {
         "command": "uv",
         "args": ["--directory", "/absolute/path/to/IndustriConnect/MODBUS-Project/modbus-python", "run", "modbus-mcp"],
         "env": {
           "MODBUS_TYPE": "tcp",
           "MODBUS_HOST": "127.0.0.1",
           "MODBUS_PORT": "1502",
           "MODBUS_DEFAULT_SLAVE_ID": "1"
         }
       }
     }
   }
   ```

4. **Ask the assistant to use the tools**

   Once connected, you can say things like:

   - “Read the first 10 holding registers from the mock Modbus device.”
   - “Increase the pump speed setpoint to 60%.”

Replace the paths and environment variables for other protocols; each project’s README contains protocol‑specific examples and configuration.

---

## mcp-manager-ui

The `mcp-manager-ui` project provides a browser UI for:

- Managing MCP backends (including these protocol servers)
- Testing tools interactively
- Running conversations against one or more MCP servers

See `mcp-manager-ui/README.md` for installation and usage instructions.

---

## Whitepaper and Architecture

For a deeper dive into the motivation, architecture, and design decisions behind this suite (including security, safety, and roadmap), see:

- `whitepaper/` – high‑level whitepaper for the IndustriConnect MCP suite

---

## Contributing

Contributions are welcome — new tools or wider coverage in an existing
protocol, better mocks and test scenarios, documentation and examples, or a
protocol the suite does not cover yet.

Each protocol server is developed in its own repository, so issues and pull
requests for a server or its mock go there. This repository takes changes to
`mcp-manager-ui`, the whitepaper, the suite-wide docs and the submodule pins.

[**CONTRIBUTING.md**](CONTRIBUTING.md) lists the protocol repositories and
covers the layout every protocol project follows, how to run a server against
its mock, and the three invariants that keep all ten consistent. Please also
read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

These servers talk to industrial equipment, and most of the protocols they
speak have no authentication of their own. [**SECURITY.md**](SECURITY.md)
explains how to run them safely and how to report a vulnerability privately —
please do not open a public issue for one.

## 📌 Citation
If you use this work, please cite:

```bibtex
@misc{xavier2026industriconnectmcpadaptersmockfirst,
  title={IndustriConnect: MCP Adapters and Mock-First Evaluation for AI-Assisted Industrial Operations},
  author={Melwin Xavier and Melveena Jolly and Vaisakh M A and Midhun Xavier},
  year={2026},
  eprint={2603.24703},
  archivePrefix={arXiv},
  primaryClass={cs.SE},
  url={https://arxiv.org/abs/2603.24703}
}
```

---

## License

Released under the [MIT License](LICENSE).
