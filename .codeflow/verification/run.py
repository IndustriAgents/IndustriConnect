#!/usr/bin/env python3
"""Run the same offline check environment for trusted local Code Flow tasks."""

import json
import os
import subprocess
import sys
from pathlib import Path

mode = sys.argv[1] if len(sys.argv) == 2 else ""
if mode not in ("setup", "check"):
    sys.exit("Usage: run.py setup|check")
root = Path(
    subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
).resolve()
common = Path(
    subprocess.check_output(
        ["git", "rev-parse", "--git-common-dir"], cwd=root, text=True
    ).strip()
)
common = (root / common).resolve()
config = json.loads((Path(__file__).resolve().parents[1] / "config.json").read_text())
command = [
    "docker",
    "run",
    "--rm",
    "--init",
    "--pull=never",
    "--network=none",
    "--user",
    f"{os.getuid()}:{os.getgid()}",
    "-e",
    "HOME=/tmp",
    "-e",
    "CI=1",
    "-v",
    f"{root}:{root}",
    "-v",
    f"{common}:{common}:ro",
    "-w",
    str(root),
    config["image"],
    f"industriconnect-{mode}",
]
sys.exit(subprocess.call(command))
