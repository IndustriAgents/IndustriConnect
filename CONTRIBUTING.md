# Contributing to IndustriConnect

Thanks for taking an interest. This repository is ten MCP servers — one per
industrial protocol — plus a mock device for each and a web UI for driving
them. The value of the suite is that all ten behave the same way, so most of
what follows is about keeping them consistent.

## The shape every protocol project follows

```text
<PROTOCOL>-Project/
├── <protocol>-python/        # the MCP server: pyproject.toml + src/<protocol>_mcp/
├── <protocol>-mock-*/        # a simulated device, so nothing is rehearsed on live plant
└── README.md                 # protocol-specific quickstart
```

Three things hold the suite together, and a change that breaks one of them
needs a reason in the pull request:

1. **One response envelope.** Every tool returns `{ success, data, error, meta }`.
   A client that can read one server's output can read all ten.
2. **Read-only by default.** Tools that write a coil, a register, a tag or a
   PDO change physical equipment. They are separated from the read tools, and a
   server should not expose them unless it has been configured to.
3. **A mock for every protocol.** If you add a tool, the mock has to be able to
   answer it, or nobody can test it without a plant.

## Getting set up

The Python servers use [`uv`](https://docs.astral.sh/uv/). Each is its own
project, so work inside the one you are changing:

```bash
cd MODBUS-Project/modbus-python
uv sync
uv run modbus-mcp-server
```

Start the matching mock first — it is the thing the server talks to:

```bash
cd MODBUS-Project/modbus-mock-server
uv run python -m modbus_mock        # check the project README for the exact entry point
```

For `mcp-manager-ui`:

```bash
cd mcp-manager-ui
npm install
npm run dev
```

## Testing a change

Run whatever tests the protocol project has, then drive the server the way a
user would — through the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
or a real client — against the mock:

```bash
npx @modelcontextprotocol/inspector uv run modbus-mcp-server
```

Call the tool you changed, and check the envelope, not just the value.

**Do not test against production equipment.** If a change genuinely cannot be
verified against a mock, say so in the pull request and describe the bench you
used.

## House rules for the code

- MCP speaks over **stdio**, so `stdout` belongs to the protocol. All logging
  goes to `stderr`. A stray `print()` corrupts the session.
- Fail at startup, not at the first tool call, when configuration is unusable.
- An error is a returned `{ success: false, error }`, not an exception that
  kills the server. The model needs to be told what went wrong.
- Keep tool names and argument names aligned with the other nine servers.

## Pull requests

Keep them to one protocol where you can — a change across all ten is hard to
review and harder to bisect. Say which protocol is affected, how you tested,
and whether the change touches anything that can write to a device.

## Adding a new protocol

Copy the closest existing project rather than starting from scratch, and bring
the whole shape with it: server, mock, README, and the same envelope. Open an
issue first so we can talk through whether the protocol fits the model — some
do not map cleanly onto request/response tools.

## Code of Conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
