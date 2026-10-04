# Contributing to IndustriConnect

Thanks for taking an interest. IndustriConnect is ten MCP servers — one per
industrial protocol — plus a mock device for each and a web UI for driving
them. The value of the suite is that all ten behave the same way, so most of
what follows is about keeping them consistent.

## Where a change goes

Each protocol server is developed in its own repository, and this repository
pins every one of them as a git submodule. A bug fix, a new tool or a better
mock for one protocol is an issue or pull request **in that protocol's
repository**:

| Protocol | Folder here | Repository |
|---|---|---|
| BACnet/IP | `BACnet-Project/` | [IndustriAgents/BACnet-MCP](https://github.com/IndustriAgents/BACnet-MCP) |
| DNP3 | `DNP3-Project/` | [IndustriAgents/DNP3-MCP](https://github.com/IndustriAgents/DNP3-MCP) |
| EtherCAT | `EtherCAT-Project/` | [IndustriAgents/EtherCAT-MCP](https://github.com/IndustriAgents/EtherCAT-MCP) |
| EtherNet/IP | `EtherNetIP-Project/` | [IndustriAgents/EtherNetIP-MCP](https://github.com/IndustriAgents/EtherNetIP-MCP) |
| Modbus | `MODBUS-Project/` | [IndustriAgents/MODBUS-MCP](https://github.com/IndustriAgents/MODBUS-MCP) |
| MQTT / Sparkplug B | `MQTT-Project/` | [IndustriAgents/MQTT-MCP](https://github.com/IndustriAgents/MQTT-MCP) |
| OPC UA | `OPCUA-Project/` | [IndustriAgents/OPCUA-MCP](https://github.com/IndustriAgents/OPCUA-MCP) |
| PROFIBUS DP/PA | `PROFIBUS-Project/` | [IndustriAgents/PROFIBUS-MCP](https://github.com/IndustriAgents/PROFIBUS-MCP) |
| PROFINET | `PROFINET-Project/` | [IndustriAgents/PROFINET-MCP](https://github.com/IndustriAgents/PROFINET-MCP) |
| Siemens S7 (S7comm) | `S7comm-Project/` | [IndustriAgents/S7comm-MCP](https://github.com/IndustriAgents/S7comm-MCP) |

If a protocol repository has a CONTRIBUTING.md of its own (OPC UA does),
follow it for that server.

This repository holds what the servers share:

- `mcp-manager-ui/` — the web UI and its `mcp-backend`
- `whitepaper/` — architecture and design background
- the suite-wide docs and the issue and pull request templates
- the submodule pins: `.gitmodules` and the commit each `*-Project/` folder
  points at

You will rarely need to move a pin by hand. Every night the
[Sync protocol submodules](.github/workflows/sync-submodules.yml) workflow
opens or updates a single pull request on `auto/bump-submodules` that moves
every pin that has fallen behind, and a protocol repository that sends a
dispatch when its `main` moves (see
[Adding a new protocol](#adding-a-new-protocol)) starts it straight away.
Review and merge that one pull request. If it marks a pin as *not a
fast-forward*, the new commit does not contain the old one, so look at the
commits it would drop before merging.

A change meant for all ten servers needs one pull request per protocol
repository, for example renaming a tool argument everywhere. Open an issue
here first so the change is agreed once, then link each pull request to it.

### Working on a server from a suite checkout

A submodule is a full clone of its repository, so you can work on it in place:

```bash
git clone --recurse-submodules https://github.com/IndustriAgents/IndustriConnect.git
cd IndustriConnect/MODBUS-Project
git switch main              # submodules are checked out on a detached HEAD
git switch -c fix/my-change
```

Commit there, push to your fork of the protocol repository, and open the pull
request against that repository. Keep the moved `MODBUS-Project` pin out of any
pull request to this repository. It moves on its own once your change is
merged upstream. Cloning the protocol repository on its own works just as well.

## The shape every protocol project follows

```text
<PROTOCOL>-Project/
├── <protocol>-python/        # the MCP server: pyproject.toml + src/<protocol>_mcp/
├── <protocol>-mock-*/        # a simulated device, so nothing is rehearsed on live plant
└── README.md                 # protocol-specific quickstart
```

OPC UA is the exception in layout, not in principle: it keeps its Python and
Node servers and its mocks under `packages/`.

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
project, so work inside the one you are changing. The paths below are relative
to a suite checkout with its submodules initialised. In a clone of the protocol
repository itself, drop the `MODBUS-Project/` prefix.

```bash
cd MODBUS-Project/modbus-python
uv sync
uv run modbus-mcp
```

Start the matching mock first — it is the thing the server talks to:

```bash
cd MODBUS-Project/modbus-mock-server
uv sync
uv run modbus-mock-server     # each project's pyproject.toml names its entry points
```

For `mcp-manager-ui`:

```bash
cd mcp-manager-ui
npm install
PORT=3003 npm run dev        # the UI expects mcp-backend on port 3003
```

## Testing a change

Run whatever tests the protocol project has, then drive the server the way a
user would — through the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
or a real client — against the mock. From the server's directory:

```bash
npx @modelcontextprotocol/inspector uv run modbus-mcp
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

A pull request to a protocol repository covers that one protocol. A change
across several protocols is split per repository, as described above, because
one change spread over ten servers is hard to review and harder to bisect. Say
how you tested, and whether the change touches anything that can write to a
device.

A pull request to this repository should leave the `*-Project/` pins alone
unless moving one is the point of the change.

## Adding a new protocol

Open an issue here first so we can talk through whether the protocol fits the
model — some do not map cleanly onto request/response tools.

Once it is agreed, the protocol gets its own `IndustriAgents/<Protocol>-MCP`
repository. It has to be public and have a `main` branch. The sync workflow
cannot read private repositories, and one submodule it cannot fetch stops it
from moving any pin; `git clone --recurse-submodules` would also fail for
everyone outside the organisation.

Copy the closest existing repository rather than starting from scratch, and
bring the whole shape with it: server, mock, README and the same envelope.

Give the new repository this workflow as
`.github/workflows/notify-industriconnect.yml`. When `main` moves, it sends
this repository a `protocol-mcp-updated` repository dispatch, which starts the
sync straight away:

```yaml
name: Notify IndustriConnect

on:
  push:
    branches: [main]

permissions: {}

jobs:
  notify:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Send protocol-mcp-updated to IndustriConnect
        env:
          GH_TOKEN: ${{ secrets.INDUSTRICONNECT_DISPATCH_TOKEN }}
        run: |
          if [ -z "$GH_TOKEN" ]; then
            echo "::notice::No INDUSTRICONNECT_DISPATCH_TOKEN secret, so IndustriConnect picks this commit up in its nightly sync."
            exit 0
          fi
          gh api repos/IndustriAgents/IndustriConnect/dispatches \
            -f event_type=protocol-mcp-updated \
            -f "client_payload[repo]=$GITHUB_REPOSITORY" \
            -f "client_payload[sha]=$GITHUB_SHA"
```

The workflow needs an `INDUSTRICONNECT_DISPATCH_TOKEN` Actions secret in the
new repository, holding a token that may write Contents on IndustriConnect,
the permission a repository dispatch needs. Without the secret it only leaves
a notice, and the new protocol is picked up by the nightly run. Then add the
repository here as a submodule:

```bash
git submodule add -b main https://github.com/IndustriAgents/<Protocol>-MCP.git <Protocol>-Project
```

The sync workflow reads `.gitmodules`, so it picks the new submodule up without
changes. `README.md`, this file and the issue templates each need a line for
it.

## Code of Conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
