#!/usr/bin/env python3
"""Prepare the offline image from tracked files in an explicit source checkout."""

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

here = Path(__file__).resolve().parent
configured_image = json.loads((here.parent / "config.json").read_text())["image"]
parser = argparse.ArgumentParser()
parser.add_argument(
    "source", type=Path, help="Clean source worktree whose dependency locks to cache"
)
parser.add_argument(
    "--tag",
    default=configured_image,
    help="Image tag (defaults to .codeflow/config.json)",
)
args = parser.parse_args()
source = args.source.resolve()


def require_checkout(path):
    """Do not let git walk up from an empty submodule into the parent repo."""
    try:
        top = Path(
            subprocess.check_output(
                ["git", "rev-parse", "--show-toplevel"],
                cwd=path,
                text=True,
                stderr=subprocess.DEVNULL,
            ).strip()
        ).resolve()
    except (OSError, subprocess.CalledProcessError):
        parser.error(f"Not an initialized checkout: {path}")
    if top != path:
        parser.error(
            f"Not an initialized checkout: {path}; initialize its submodule first"
        )
    dirty = subprocess.check_output(
        ["git", "status", "--porcelain", "--untracked-files=no"],
        cwd=path,
        text=True,
    )
    if dirty:
        parser.error(
            f"Tracked changes in {path}; build from a clean, committed checkout"
        )


require_checkout(source)
for folder in ("MQTT-Project", "OPCUA-Project"):
    require_checkout(source / folder)
with tempfile.TemporaryDirectory(prefix="industriconnect-check-image-") as temporary:
    context = Path(temporary)
    for name in ("Dockerfile", "setup.sh", "check.py"):
        shutil.copy2(here / name, context / name)
    for folder in ("mcp-manager-ui", "MQTT-Project", "OPCUA-Project"):
        repo = source if folder == "mcp-manager-ui" else source / folder
        scope = ["--", folder] if folder == "mcp-manager-ui" else []
        files = (
            subprocess.check_output(["git", "ls-files", "-z", *scope], cwd=repo)
            .decode()
            .split("\0")
        )
        for name in filter(None, files):
            src = repo / name
            if not src.is_file() or src.is_symlink():
                continue
            if src.name == ".env" or src.name.startswith(".env."):
                continue
            dest = context / "source" / src.relative_to(source)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
    subprocess.run(
        ["docker", "build", "--progress=plain", "-t", args.tag, str(context)],
        check=True,
    )
