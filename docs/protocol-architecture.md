# Protocol architecture and verification

Nine independently packaged MCP servers use the architectural patterns in
[OPCUA-MCP](../OPCUA-Project/docs/architecture.md). Each server exposes JSON-RPC over
local stdio and owns its configured device, broker, endpoint, or bus. The
protocol repositories already contained substantial implementations; this
workspace preserves those implementations and strengthens their common request,
execution, and packaging boundaries.

## Architecture assessment

The most useful parts of the OPC UA reference are its explicit tool contract,
instance-owned connections and policy, separation of application operations from
native transports, bounded requests, durable control audit, and verification of
installed artifacts. Its [feature-module design](../OPCUA-Project/docs/feature-modules.md)
keeps MCP registration separate from protocol operations and recovery decisions.

```mermaid
flowchart LR
    MCP[MCP client] -->|stdio| Boundary[Contract and request validation]
    Boundary --> Execution[Instance policy, admission and audit]
    Execution --> Application[Protocol operations]
    Application --> Adapter[Native adapter and send tracking]
    Adapter --> Device[Device, broker or bus]
```

The nine implementations use these responsibilities:

| Component | Responsibility |
|---|---|
| `contract/tools.json` | Canonical tools, schemas, routing, legacy aliases, result envelope and request limits |
| `protocol/` | MCP registration, bounded argument validation, routing and wire error conversion |
| `application/` | Reads, writes, discovery, diagnostics and execution admission |
| `domain/` | Types, ports, policy and error/outcome vocabulary |
| `adapters/` | Native libraries, connection lifecycle, cancellation and send tracking |
| `infrastructure/` | Audit storage, maps and execution context |
| `server.py` | Composition of a server and its resources |

The common result is `{success, data, error, meta}`. Failures set MCP `isError`,
and text and structured results describe the same envelope. Policy and native
write gates are both enforced; authorization of a legacy alias resolves to its
canonical operation. Optional audit intent is persisted before control dispatch.
Audit-result failures annotate the observed result without retrying the action.
Policy and audit paths must resolve to regular files. Policy reads are bounded
to 64 KiB and 16 nesting levels, reject duplicate fields, and remain bounded if
the file grows during reading. Pipes and devices cannot block startup or receive
audit records in place of a durable audit file.

Request validation bounds decoded JSON before schema processing or device work:
32 nesting levels, 10,000 entries per container, 50,000 total values, and the
configured byte budget. Non-finite numbers, non-JSON values, malformed Unicode
and unknown top-level parameters are rejected. Consolidated selector routes
validate the full contract schema. MQTT also validates direct canonical tools
against their contract schemas. Other established direct routes and legacy aliases
retain their native argument validation and documented coercion for compatibility.
These application limits do not replace framing limits inside the MCP SDK.

Unexpected failures after entering a control handler report an unknown outcome
unless native send tracking establishes a more precise result. Cancellation is
not evidence that a worker or device stopped. Native adapters retain their
protocol-specific retry rules; the common boundary adds no resend loop.

This is architectural reuse, with these deliberate differences from OPCUA-MCP:

- Each protocol has one Python implementation. npm launches its bundled wheel;
  it is not a second TypeScript protocol implementation.
- OPC UA namespaces, history, alarms, certificates and interlocks are not
  invented for protocols that lack equivalent operations.
- Local stdio supports one caller context per process. These packages do not
  supply a shared remote service or multi-tenant authorization.
- Some compatibility paths and established native recovery helpers remain.
  See each repository's architecture document for its exact boundaries.

## Servers and implemented backend scope

| Repository | MCP command | Tools | Existing native backend and limits |
|---|---|---:|---|
| [BACnet](../BACnet-Project/docs/architecture.md) | `bacnet-mcp` | 5 | BACnet/IP using bacpypes3 |
| [DNP3](../DNP3-Project/docs/architecture.md) | `dnp3-mcp` | 5 | dnp3py master; independent OpenDNP3 interoperability is a separate optional check |
| [EtherCAT](../EtherCAT-Project/docs/architecture.md) | `ethercat-mcp` | 11 | PySOEM; requires an appropriate interface and OS privileges |
| [EtherNet/IP](../EtherNetIP-Project/docs/architecture.md) | `ethernetip-mcp` | 8 | pycomm3 for supported Logix operations |
| [Modbus](../MODBUS-Project/docs/architecture.md) | `modbus-mcp` | 6 | pymodbus TCP, UDP and serial/RTU |
| [MQTT](../MQTT-Project/docs/architecture.md) | `mqtt-mcp` | 9 | paho-mqtt and Sparkplug B; delivery acknowledgement does not establish physical command completion |
| [PROFIBUS](../PROFIBUS-Project/docs/architecture.md) | `profibus-mcp` | 7 | Mock DP-style I/O; live serial/DP backend remains unimplemented |
| [PROFINET](../PROFINET-Project/docs/architecture.md) | `profinet-mcp` | 11 | Live DCP discovery; cyclic I/O and device configuration currently require the mock backend |
| [S7comm](../S7comm-Project/docs/architecture.md) | `s7comm-mcp` | 9 | python-snap7; PLC access settings and block configuration still apply |

There are 71 canonical tools. Mock and fake-driver tests verify software behavior;
they do not certify timing, electrical interfaces, or physical-device compatibility.
Unsupported live operations fail explicitly. A successful package build does not
extend the supported native backend scope shown above.

## Build and verify

The workspace helper needs Python 3.11+, `uv`, Node 20+, and npm. Individual
servers retain their declared Python requirements and lockfiles. Initialise the submodules with `git submodule update --init --recursive`, then
run from the suite root. The helper accepts `-MCP` repository names and
`-Project` directory names:

```sh
# Discover package versions and canonical tools without starting servers.
python3 scripts/mcp_workspace.py inventory

# Validate contracts, locks, lint, formatting and Python suites.
python3 scripts/mcp_workspace.py check

# Build all Python wheels/sdists, test npm launchers and pack npm tarballs.
python3 scripts/mcp_workspace.py build

# Full checks + builds + installed wheel/npm MCP smoke tests + package metadata.
python3 scripts/mcp_workspace.py verify

# Select repositories when iterating.
python3 scripts/mcp_workspace.py verify BACnet-MCP MODBUS-MCP

# Verify current artifact contents and produce SHA-256 inventory without rebuilding.
python3 scripts/mcp_workspace.py artifacts
```

Checks run sequentially to avoid test fixtures competing for ports. The helper
stops a failed project's pipeline, continues with the remaining projects, and
returns a nonzero exit status if any project fails. The default timeout is 900
seconds per command; override with `--timeout`. Command logs and JSON reports
are saved under `.build/`; `--report PATH` selects another report destination.
Reports are checkpointed atomically after each step. An interrupted run retains
its completed checks with `complete: false` and `success: false`. Ctrl-C cleans
up the active subprocess group on POSIX and exits with status 130.
Optional environment-dependent tests retain their repository skip conditions.

Artifacts remain in each repository: Python wheel and source distribution in
`dist/`, npm tarball in `npm/`. The artifact inventory verifies the source and
contract inside distributions and byte equality of the wheel embedded in npm.
This prevents an old artifact with an unchanged version from passing verification.
Registry publication is a separate release action; these commands never publish.

Use a source entry point for local development, configuring its endpoint according
to that repository's README:

```sh
uv run --project BACnet-Project/bacnet-python --locked bacnet-mcp --help
```

For deployment, launch the desired command from its built local wheel or npm
tarball. Use a separate stdio process for each configured endpoint. Package names
are `industriagents-<protocol>-mcp`; Python module and command names are unchanged.

The workspace helper's own stale-artifact and failure-reporting regressions run
without third-party Python dependencies:

```sh
python3 -m unittest discover -s scripts -p 'test_*.py' -v
```
