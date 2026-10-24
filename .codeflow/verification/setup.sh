#!/bin/sh
set -eu
if [ "${CODEFLOW_PREPARE_ONLINE:-0}" != 1 ]; then
  export UV_OFFLINE=1 npm_config_offline=true
fi
export UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
for package in mcp-manager-ui mcp-manager-ui/mcp-backend OPCUA-Project/packages/server-node OPCUA-Project/packages/mock-server-aggregate OPCUA-Project/packages/mock-server-alarms; do
  (cd "$package" && npm ci --ignore-scripts --no-audit --no-fund)
done
(cd MQTT-Project/mqtt-python && uv sync --locked --python python3)
(cd OPCUA-Project && uv sync --locked --all-packages --python python3)
