# Security Policy

## What this suite is, in security terms

Every server here is a bridge between a language model and industrial
equipment. An MCP server speaks stdio to its client and a fieldbus protocol to
a device, which means the trust boundary sits *inside* the server: whatever the
model decides to call, the device is asked to do.

Most of these protocols were designed for a physically isolated network and
carry no authentication or encryption of their own. Modbus/TCP, DNP3 without
secure authentication, S7comm, PROFIBUS, PROFINET RT and EtherCAT all fall into
that category — anyone who can reach the wire can read and write. MQTT and
OPC UA can be secured; whether they *are* is a property of your deployment, not
of this code.

So treat these servers as equipment on the control network, not as an
application on the office network.

## Running them safely

- **Start against the mocks.** Every protocol project ships a mock device
  precisely so that an agent can be exercised end to end without touching real
  plant. Do that first, every time.
- **Keep it read-only until you mean otherwise.** Write and control tools move
  physical equipment. There is no undo, and a language model will call a tool
  it has been given.
- **Do not expose a server beyond the host running the client.** These are
  stdio processes meant to run beside the MCP client, not network services.
- **Segment the network.** The server should sit where a PLC engineering
  workstation would sit, behind whatever separates your control network from
  everything else.
- **Never point one at a safety system.** Safety-instrumented functions are out
  of scope for anything in this repository.

## Reporting a vulnerability

Please report privately, through
[GitHub private vulnerability reporting](https://github.com/IndustriAgents/IndustriConnect/security/advisories/new),
or by email to hi@industriagents.com.

Please do not open a public issue for a vulnerability.

Include the protocol project affected, the version or commit, what an attacker
would gain, and a reproduction if you have one. We will acknowledge within a
week and keep you updated as we work on a fix.

## Scope

In scope: the MCP servers, the mock devices, and `mcp-manager-ui` in this
repository.

Out of scope: vulnerabilities in the underlying protocols themselves (the lack
of authentication in Modbus is a property of Modbus), in third-party libraries
— report those upstream — and in vendor PLC firmware.
