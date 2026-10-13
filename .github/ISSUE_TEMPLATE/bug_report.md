---
name: Bug report
about: Report a problem with mcp-manager-ui, the suite docs, or the submodule pins
title: "[Bug] "
labels: bug
assignees: ""
---

<!--
A bug in one protocol server or its mock belongs in that protocol's own
repository. Each one is listed on the "New issue" page and in CONTRIBUTING.md.
This template is for mcp-manager-ui, the suite-wide docs, the submodule pins,
and problems that several protocol servers share.
-->

**What is affected?**
- [ ] mcp-manager-ui
- [ ] Suite docs or the whitepaper
- [ ] A submodule pin or the sync workflow
- [ ] Several protocol servers in the same way. Which ones:

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
- [ ] A mock device from the suite
- [ ] Real equipment — vendor and model:

**Environment**
- OS:
- Python version:
- Node.js version and browser (for mcp-manager-ui):
- Commit SHA of this repository, and of any protocol submodule involved:

**Additional context**
Register addresses, node IDs, topics, device config, stderr logs — whatever
would let someone else reproduce it against the mock.
