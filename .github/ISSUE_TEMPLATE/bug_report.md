---
name: Bug report
about: Report a problem with one of the MCP servers or mocks
title: "[Bug] "
labels: bug
assignees: ""
---

**Which protocol project?**
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

**Describe the bug**
What happens, and what you expected instead.

**To reproduce**
The MCP client you used (Claude Desktop / Claude Code / Cursor / Inspector /
mcp-manager-ui), the tool you called, and the arguments you passed.

1.
2.
3.

**Tool output**
```json
paste the { success, data, error, meta } envelope, or the error
```

**What was on the other end?**
- [ ] The mock device from this repo
- [ ] Real equipment — vendor and model:

**Environment**
- OS:
- Python version:
- Commit SHA:

**Additional context**
Register addresses, node IDs, topics, device config, stderr logs — whatever
would let someone else reproduce it against the mock.
