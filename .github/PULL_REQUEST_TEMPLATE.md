## Summary

<!-- What does this PR do, and why? -->

## Protocol project(s) affected

- [ ] BACnet
- [ ] DNP3
- [ ] EtherCAT
- [ ] EtherNet/IP
- [ ] Modbus
- [ ] MQTT / Sparkplug B
- [ ] OPC UA
- [ ] PROFIBUS
- [ ] PROFINET
- [ ] S7comm
- [ ] mcp-manager-ui
- [ ] Docs / CI only

## Type of change

- [ ] Bug fix
- [ ] New tool
- [ ] New protocol project
- [ ] Documentation
- [ ] Refactor / chore

## Does this change what can be written to a device?

- [ ] No
- [ ] Yes — describe the new capability and how it is gated:

## Checklist

- [ ] Tools still return the shared `{ success, data, error, meta }` envelope.
- [ ] The mock device can exercise the change, and I tested against it.
- [ ] Nothing was tested against production equipment.
- [ ] `stdout` is still clean — all logging goes to `stderr`.
- [ ] I updated the project README where relevant.

## How to test

<!-- The exact commands and tool calls a reviewer can run against the mock. -->
