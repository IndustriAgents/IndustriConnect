# Protocol package migration: 0.3.0

The nine protocol submodules below use the OPC UA-inspired architecture with
independent contracts, application operations and native adapters. The suite
continues to launch each server independently. OPC UA retains its own release
version and is outside this migration.

The pinned source revisions all declare version **0.3.0**. npm and PyPI use the
same distribution name. Registry publication is a separate step: confirm that
0.3.0 is available on the intended registry before using registry commands.
The source checkout remains usable while publication is pending.

| Repository and pinned revision | Suite submodule | npm / PyPI package | Advertised tools |
|---|---|---|---:|
| [BACnet-MCP](https://github.com/IndustriAgents/BACnet-MCP/tree/53607c2c74c538ee4be1e093260d1026114ed396) | `BACnet-Project` | `industriagents-bacnet-mcp` | 5 |
| [DNP3-MCP](https://github.com/IndustriAgents/DNP3-MCP/tree/60ba639e6cebe2067976d56a52f0f9decbde5cc7) | `DNP3-Project` | `industriagents-dnp3-mcp` | 5 |
| [EtherCAT-MCP](https://github.com/IndustriAgents/EtherCAT-MCP/tree/d9db71391e084f46b7c0bbfcc172def24ffa5d50) | `EtherCAT-Project` | `industriagents-ethercat-mcp` | 11 |
| [EtherNetIP-MCP](https://github.com/IndustriAgents/EtherNetIP-MCP/tree/e3131e57ae12130650fc536f6a961327dfd78066) | `EtherNetIP-Project` | `industriagents-ethernetip-mcp` | 8 |
| [MODBUS-MCP](https://github.com/IndustriAgents/MODBUS-MCP/tree/1390ed1225e73934ed50b2e2d7190877e448f43d) | `MODBUS-Project` | `industriagents-modbus-mcp` | 6 |
| [MQTT-MCP](https://github.com/IndustriAgents/MQTT-MCP/tree/a8472d1f34f4f377888aade308816891ff41b665) | `MQTT-Project` | `industriagents-mqtt-mcp` | 9 |
| [PROFIBUS-MCP](https://github.com/IndustriAgents/PROFIBUS-MCP/tree/79bf07a4a3433cb911c6ac1c50060ea1562b9446) | `PROFIBUS-Project` | `industriagents-profibus-mcp` | 7 |
| [PROFINET-MCP](https://github.com/IndustriAgents/PROFINET-MCP/tree/fe1bdd9d010fb5eba891a1ba5d70bae256c62d5f) | `PROFINET-Project` | `industriagents-profinet-mcp` | 11 |
| [S7comm-MCP](https://github.com/IndustriAgents/S7comm-MCP/tree/9cb0dbbca6e9d90336a0b3264e3707b202ffebe3) | `S7comm-Project` | `industriagents-s7comm-mcp` | 9 |

The catalog contains 71 tools across these protocols. Legacy tool names remain
callable but are hidden from discovery. Each submodule's `docs/architecture.md`
contains the canonical modes and migration mapping; `contract/tools.json` is
the complete machine-readable contract.

## Launch from this checkout

For example, configure the suite with command `uv` and these arguments:

```json
["--directory", "/absolute/path/to/IndustriConnect/MODBUS-Project/modbus-python", "run", "--locked", "modbus-mcp"]
```

Retain the configured protocol connection environment and existing write gates.
To install a published version independently:

```sh
uvx --from industriagents-modbus-mcp==0.3.0 modbus-mcp
npx -y industriagents-modbus-mcp@0.3.0
```

The npm launcher bundles the matching Python wheel and requires Node 20+ and
`uv`; first use may download Python and dependencies. There is one native
implementation per protocol. The umbrella does not supply a shared runtime.

## Integration checks

On 2026-10-15 the suite's existing `MCPServerManager` loaded all nine locally
built wheels, discovered all 71 tools, preserved every input schema, and
reported invalid mode calls as application/MCP errors. The backend's five
result-handling tests and TypeScript build also passed. The independent
repositories run their native regression, dependency-floor and package smoke
checks in GitHub Actions.

No physical-device acceptance test is implied. PROFIBUS live DP remains
unimplemented; PROFINET live support remains DCP discovery. See each protocol's
capability limits before selecting a live backend.
