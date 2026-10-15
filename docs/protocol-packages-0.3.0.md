# Protocol package migration: 0.3.0

The nine protocol submodules below use the OPC UA-inspired architecture with
independent contracts, application operations and native adapters. The suite
continues to launch each server independently. OPC UA retains its own release
version and is outside this migration.

All nine packages are published at **0.3.0** on both npm and PyPI. Both
registries use the same distribution name. Registry downloads were verified
against the tested GitHub artifacts and installed outside the source checkout.

| Repository and pinned revision | Suite submodule | PyPI / npm package | Advertised tools |
|---|---|---|---:|
| [BACnet-MCP](https://github.com/IndustriAgents/BACnet-MCP/tree/53607c2c74c538ee4be1e093260d1026114ed396) | `BACnet-Project` | [industriagents-bacnet-mcp](https://pypi.org/project/industriagents-bacnet-mcp/0.3.0/) · [npm](https://www.npmjs.com/package/industriagents-bacnet-mcp/v/0.3.0) | 5 |
| [DNP3-MCP](https://github.com/IndustriAgents/DNP3-MCP/tree/60ba639e6cebe2067976d56a52f0f9decbde5cc7) | `DNP3-Project` | [industriagents-dnp3-mcp](https://pypi.org/project/industriagents-dnp3-mcp/0.3.0/) · [npm](https://www.npmjs.com/package/industriagents-dnp3-mcp/v/0.3.0) | 5 |
| [EtherCAT-MCP](https://github.com/IndustriAgents/EtherCAT-MCP/tree/d9db71391e084f46b7c0bbfcc172def24ffa5d50) | `EtherCAT-Project` | [industriagents-ethercat-mcp](https://pypi.org/project/industriagents-ethercat-mcp/0.3.0/) · [npm](https://www.npmjs.com/package/industriagents-ethercat-mcp/v/0.3.0) | 11 |
| [EtherNetIP-MCP](https://github.com/IndustriAgents/EtherNetIP-MCP/tree/e3131e57ae12130650fc536f6a961327dfd78066) | `EtherNetIP-Project` | [industriagents-ethernetip-mcp](https://pypi.org/project/industriagents-ethernetip-mcp/0.3.0/) · [npm](https://www.npmjs.com/package/industriagents-ethernetip-mcp/v/0.3.0) | 8 |
| [MODBUS-MCP](https://github.com/IndustriAgents/MODBUS-MCP/tree/1390ed1225e73934ed50b2e2d7190877e448f43d) | `MODBUS-Project` | [industriagents-modbus-mcp](https://pypi.org/project/industriagents-modbus-mcp/0.3.0/) · [npm](https://www.npmjs.com/package/industriagents-modbus-mcp/v/0.3.0) | 6 |
| [MQTT-MCP](https://github.com/IndustriAgents/MQTT-MCP/tree/a8472d1f34f4f377888aade308816891ff41b665) | `MQTT-Project` | [industriagents-mqtt-mcp](https://pypi.org/project/industriagents-mqtt-mcp/0.3.0/) · [npm](https://www.npmjs.com/package/industriagents-mqtt-mcp/v/0.3.0) | 9 |
| [PROFIBUS-MCP](https://github.com/IndustriAgents/PROFIBUS-MCP/tree/79bf07a4a3433cb911c6ac1c50060ea1562b9446) | `PROFIBUS-Project` | [industriagents-profibus-mcp](https://pypi.org/project/industriagents-profibus-mcp/0.3.0/) · [npm](https://www.npmjs.com/package/industriagents-profibus-mcp/v/0.3.0) | 7 |
| [PROFINET-MCP](https://github.com/IndustriAgents/PROFINET-MCP/tree/fe1bdd9d010fb5eba891a1ba5d70bae256c62d5f) | `PROFINET-Project` | [industriagents-profinet-mcp](https://pypi.org/project/industriagents-profinet-mcp/0.3.0/) · [npm](https://www.npmjs.com/package/industriagents-profinet-mcp/v/0.3.0) | 11 |
| [S7comm-MCP](https://github.com/IndustriAgents/S7comm-MCP/tree/9cb0dbbca6e9d90336a0b3264e3707b202ffebe3) | `S7comm-Project` | [industriagents-s7comm-mcp](https://pypi.org/project/industriagents-s7comm-mcp/0.3.0/) · [npm](https://www.npmjs.com/package/industriagents-s7comm-mcp/v/0.3.0) | 9 |

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
checks in GitHub Actions. All eighteen registry installations also passed MCP
initialization, version, tool catalog, schema and error-handling smoke checks.
Published wheels and npm tarballs match the verified GitHub artifact hashes.

No physical-device acceptance test is implied. PROFIBUS live DP remains
unimplemented; PROFINET live support remains DCP discovery. See each protocol's
capability limits before selecting a live backend.

## Release automation and future releases

All nine repositories have an immutable `v0.3.0` source tag. PyPI trusted
publishers are configured for owner `IndustriAgents`, each repository in the
table, workflow `release.yml`, and environment `pypi`. The PyPI jobs published
successfully through GitHub Actions using OIDC. npm's first releases were
published by the authenticated maintainer from the verified GitHub tarballs.

For future npm automation, configure each existing package's trusted publisher
with the same owner/repository/workflow and environment `npm`. The initial npm
OIDC jobs failed before the packages existed; those historical failures do not
reflect the completed, verified npm releases.

Publish future versions through their version tags. For recovery before a
version is published, the workflow on current `main` supports an explicit tag:

```sh
gh workflow run release.yml --repo IndustriAgents/MODBUS-MCP --ref main -f release_tag=vX.Y.Z
```

This checks out the immutable tag, validates its version, tests and packages it,
then publishes those artifacts. A manual run without `release_tag` only builds.
If only one registry needs recovery, rerun only that registry's failed job.
Version `0.3.0` is already published on both registries; do not republish it.
Publication workflow fixes are on `main`; the source tags and suite pins stay
unchanged.
