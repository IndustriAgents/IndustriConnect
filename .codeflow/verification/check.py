#!/usr/bin/env python3
"""Run the parent application and changed protocol suites; fail on any failing stage."""

import os
import signal
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path

root = Path.cwd()
env = dict(
    os.environ,
    UV_OFFLINE="1",
    UV_PYTHON_DOWNLOADS="never",
    npm_config_offline="true",
    MQTT_TEST_REQUIRE_BROKER="1",
    OPCUA_TESTS_REQUIRED="1",
)
stages = [
    ("Backend tests", "mcp-manager-ui/mcp-backend", ["npm", "test"], 180),
    ("Backend build", "mcp-manager-ui/mcp-backend", ["npm", "run", "build"], 180),
    ("Frontend tests", "mcp-manager-ui", ["npm", "test"], 180),
    ("Frontend build", "mcp-manager-ui", ["npm", "run", "build"], 180),
    (
        "MQTT contract consistency",
        "MQTT-Project",
        ["python3", "scripts/verify_contract.py"],
        60,
    ),
    (
        "MQTT unit and broker integration tests",
        "MQTT-Project/mqtt-python",
        ["uv", "run", "--no-sync", "pytest", "-q"],
        600,
    ),
    (
        "OPC UA generated contracts",
        "OPCUA-Project",
        ["uv", "run", "--no-sync", "python", "scripts/contract_codegen.py", "--check"],
        120,
    ),
    (
        "OPC UA Node build",
        "OPCUA-Project/packages/server-node",
        ["npm", "run", "build"],
        240,
    ),
    (
        "OPC UA Node unit tests",
        "OPCUA-Project/packages/server-node",
        ["npm", "test"],
        300,
    ),
    (
        "OPC UA Python unit and protocol end-to-end tests",
        "OPCUA-Project/tests",
        ["uv", "run", "--no-sync", "pytest", "-q", "unit/", "e2e/"],
        2100,
    ),
]
failed = []
details = []
started = time.monotonic()
for name, folder, command, timeout in stages:
    print(f"\n=== {name} ===", flush=True)
    tail = deque(maxlen=60)
    try:
        process = subprocess.Popen(
            command,
            cwd=root / folder,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
            start_new_session=True,
        )

        def stream(process=process, tail=tail):
            for line in process.stdout:
                print(line, end="", flush=True)
                tail.append(line)

        reader = threading.Thread(target=stream, daemon=True)
        reader.start()
        try:
            ok = process.wait(timeout=timeout) == 0
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            tail.append(f"Stage exceeded its {timeout}s time budget.\n")
            ok = False
        reader.join(timeout=5)
    except OSError as error:
        print(str(error), flush=True)
        ok = False
    print(f"{'PASS' if ok else 'FAIL'}: {name}", flush=True)
    if not ok:
        failed.append(name)
        details.append((name, "".join(tail)[-6000:]))
print(
    f"\nVerification: {len(stages) - len(failed)}/{len(stages)} stages passed in {time.monotonic() - started:.0f}s",
    flush=True,
)
for name in failed:
    print(f"FAILED: {name}", flush=True)
for name, detail in details:
    print(f"\nFailure evidence — {name}:\n{detail}", flush=True)
sys.exit(bool(failed))
