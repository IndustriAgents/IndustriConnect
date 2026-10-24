#!/usr/bin/env python3
"""Build and verify the nine independent protocol MCP distributions (Python 3.11+)."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import tomllib
import zipfile
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPOSITORIES = (
    "BACnet-MCP",
    "DNP3-MCP",
    "EtherCAT-MCP",
    "EtherNetIP-MCP",
    "MODBUS-MCP",
    "MQTT-MCP",
    "PROFIBUS-MCP",
    "PROFINET-MCP",
    "S7comm-MCP",
)


def canonical_name(name: str) -> str:
    return name.removesuffix("-Project") + "-MCP" if name.endswith("-Project") else name


def repository_path(name: str) -> Path:
    """Support independent checkouts and the umbrella's pinned submodule layout."""
    direct = ROOT / name
    submodule = ROOT / (name.removesuffix("-MCP") + "-Project")
    return direct if direct.is_dir() or not submodule.is_dir() else submodule


def project(repo: Path) -> dict:
    candidates = list(repo.glob("*-python/pyproject.toml"))
    if len(candidates) != 1:
        raise ValueError(f"{repo.name}: expected exactly one Python MCP project")
    manifest = candidates[0]
    metadata = tomllib.loads(manifest.read_text())["project"]
    contract = json.loads((repo / "contract/tools.json").read_text())
    npm = json.loads((repo / "npm/package.json").read_text())
    if (metadata["name"], metadata["version"]) != (npm["name"], npm["version"]):
        raise ValueError(f"{repo.name}: Python and npm metadata differ")
    return {
        "repository": canonical_name(repo.name),
        "project": str(manifest.parent.relative_to(ROOT)),
        "package": metadata["name"],
        "version": metadata["version"],
        "commands": metadata["scripts"],
        "tools": [tool["name"] for tool in contract["tools"]],
    }


def artifact_inventory(repo: Path, info: dict) -> list[dict]:
    """Verify embedded content, not merely the presence of old build files."""
    stem = info["package"].replace("-", "_") + "-" + info["version"]
    wheel = repo / "dist" / (stem + "-py3-none-any.whl")
    source = repo / "dist" / (stem + ".tar.gz")
    npm = repo / "npm" / (info["package"] + "-" + info["version"] + ".tgz")
    paths = [wheel, source, npm]
    for path in paths:
        if not path.is_file():
            raise ValueError(f"Missing artifact: {path.relative_to(ROOT)}")
    reviewed = json.loads((repo / "contract/tools.json").read_text())
    with zipfile.ZipFile(wheel) as archive:
        matches = [n for n in archive.namelist() if n.endswith("/_contract/tools.json")]
        if len(matches) != 1 or json.loads(archive.read(matches[0])) != reviewed:
            raise ValueError(f"{repo.name}: wheel contract differs from reviewed contract")
        # An old wheel can have the right version and contract but stale implementation.
        src = ROOT / info["project"] / "src"
        source_files = {p.relative_to(src).as_posix(): p for p in src.rglob("*.py")}
        if {n for n in archive.namelist() if n.endswith(".py")} != set(source_files):
            raise ValueError(f"{repo.name}: wheel Python file set differs from source")
        for member, filename in source_files.items():
            if archive.read(member) != filename.read_bytes():
                raise ValueError(f"{repo.name}: stale wheel source: {member}")
    with tarfile.open(source, "r:gz") as archive:
        project_dir = ROOT / info["project"]
        prefix = stem + "/src/"
        archived_python = {
            n.removeprefix(prefix)
            for n in archive.getnames()
            if n.startswith(prefix) and n.endswith(".py")
        }
        if archived_python != set(source_files):
            raise ValueError(f"{repo.name}: source distribution Python file set differs")
        for filename in [project_dir / "pyproject.toml", *src.rglob("*.py")]:
            member = stem + "/" + filename.relative_to(project_dir).as_posix()
            archived = archive.extractfile(member)
            if archived is None or archived.read() != filename.read_bytes():
                raise ValueError(f"{repo.name}: stale source distribution: {member}")
        matches = [n for n in archive.getnames() if n.endswith("/_contract/tools.json")]
        archived = archive.extractfile(matches[0]) if len(matches) == 1 else None
        if archived is None or json.load(archived) != reviewed:
            raise ValueError(f"{repo.name}: source distribution contract differs")
    wheel_bytes = wheel.read_bytes()
    with tarfile.open(npm, "r:gz") as archive:
        bundled = archive.extractfile("package/vendor/" + wheel.name)
        if bundled is None or bundled.read() != wheel_bytes:
            raise ValueError(f"{repo.name}: npm does not contain the exact verified wheel")
        metadata = archive.extractfile("package/package.json")
        if metadata is None or json.load(metadata) != json.loads(
            (repo / "npm/package.json").read_text()
        ):
            raise ValueError(f"{repo.name}: npm package metadata is stale")
        launchers = {
            "package/" + p.relative_to(repo / "npm").as_posix(): p
            for p in (repo / "npm/bin").rglob("*")
            if p.is_file()
        }
        archived_launchers = {
            m.name for m in archive.getmembers() if m.isfile() and m.name.startswith("package/bin/")
        }
        if archived_launchers != set(launchers):
            raise ValueError(f"{repo.name}: npm launcher file set differs")
        for member, filename in launchers.items():
            archived = archive.extractfile(member)
            if archived is None or archived.read() != filename.read_bytes():
                raise ValueError(f"{repo.name}: stale npm launcher: {member}")
    return [
        {
            "path": str(path.relative_to(ROOT)),
            "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        for path in paths
    ]


def steps(repo: Path, info: dict, mode: str):
    """Each repository remains independently buildable; reuse its release commands."""
    python = ROOT / info["project"]
    yield "contract", repo, [sys.executable, "scripts/verify_contract.py"]
    if mode in ("check", "verify"):
        yield "lock", python, ["uv", "lock", "--check"]
        yield "lint", python, ["uv", "run", "--locked", "ruff", "check", "src", "tests"]
        yield (
            "format",
            python,
            ["uv", "run", "--locked", "ruff", "format", "--check", "src", "tests"],
        )
        yield "tests", python, ["uv", "run", "--locked", "pytest", "-q"]
        for mock in sorted(repo.glob("*-mock-*")):
            if (mock / "tests").is_dir():
                yield "mock-tests", mock, ["uv", "run", "--locked", "pytest", "-q"]
    if mode in ("build", "verify"):
        yield "build", repo, [sys.executable, "scripts/prepare_npm.py"]
        yield "npm-tests", repo / "npm", ["npm", "test"]
        yield "npm-pack", repo / "npm", ["npm", "pack", "--ignore-scripts"]
    if mode == "verify":
        for runtime in ("python", "npm"):
            yield f"smoke-{runtime}", repo, [sys.executable, "scripts/smoke_packages.py", runtime]
        stem = info["package"].replace("-", "_") + "-" + info["version"]
        yield (
            "metadata",
            repo,
            [
                "uv",
                "tool",
                "run",
                "--from",
                "twine",
                "twine",
                "check",
                "--strict",
                f"dist/{stem}-py3-none-any.whl",
                f"dist/{stem}.tar.gz",
            ],
        )
    yield "diff-check", repo, ["git", "diff", "--check"]


def run_step(repo: Path, name: str, cwd: Path, command: list[str], timeout: float) -> dict:
    log = ROOT / ".build/logs" / repo.name / (name + ".log")
    log.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with log.open("w") as output:
        try:
            process = subprocess.Popen(
                command,
                cwd=cwd,
                stdout=output,
                stderr=subprocess.STDOUT,
                start_new_session=os.name == "posix",
            )
            try:
                code = process.wait(timeout=timeout)
            except (subprocess.TimeoutExpired, KeyboardInterrupt):
                if os.name == "posix":
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass  # The command exited between the interruption and cleanup.
                else:
                    process.kill()
                process.wait()
                raise
        except (OSError, subprocess.TimeoutExpired) as exc:
            output.write(f"\n{type(exc).__name__}: {exc}\n")
            code = 124 if isinstance(exc, subprocess.TimeoutExpired) else 127
    status = "passed" if code == 0 else "failed"
    print(f"{repo.name}: {name}: {status}", flush=True)
    if code:
        print(log.read_text(errors="replace")[-2500:], file=sys.stderr)
    return {
        "name": name,
        "status": status,
        "exit_code": code,
        "seconds": round(time.monotonic() - started, 2),
        "command": command,
        "log": str(log.relative_to(ROOT)),
    }


def write_report(destination: Path, report: dict) -> None:
    """Checkpoint atomically so an interrupted run retains its completed checks."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=destination.parent,
            prefix=destination.name + ".",
            suffix=".tmp",
            delete=False,
        ) as stream:
            temporary = Path(stream.name)
            json.dump(report, stream, indent=2)
            stream.write("\n")
        temporary.replace(destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("inventory", "check", "build", "verify", "artifacts"))
    parser.add_argument("repositories", nargs="*", metavar="REPOSITORY", help="Default: all nine")
    parser.add_argument("--timeout", type=float, default=900, help="Timeout per command in seconds")
    parser.add_argument(
        "--report", type=Path, help="JSON report path (default: .build/<mode>.json)"
    )
    args = parser.parse_args(argv)
    names = [canonical_name(name) for name in (args.repositories or REPOSITORIES)]
    unknown = set(names) - set(REPOSITORIES)
    if unknown:
        parser.error("Unknown repositories: " + ", ".join(sorted(unknown)))
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("--timeout must be finite and positive")
    destination = args.report or ROOT / ".build" / (args.mode + ".json")
    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "mode": args.mode,
        "projects": [],
        "success": False,
        "complete": False,
    }
    write_report(destination, report)
    interrupted = False
    for name in dict.fromkeys(names):
        repo = repository_path(name)
        result = {"repository": name, "steps": [], "status": "running"}
        report["projects"].append(result)
        write_report(destination, report)
        try:
            info = project(repo)
            result.update(info)
            if args.mode == "inventory":
                print(f"{name}: {info['package']} {info['version']}, {len(info['tools'])} tools")
            elif args.mode != "artifacts":
                for label, cwd, command in steps(repo, info, args.mode):
                    result["active_step"] = label
                    write_report(destination, report)
                    step = run_step(repo, label, cwd, command, args.timeout)
                    result["steps"].append(step)
                    result.pop("active_step", None)
                    write_report(destination, report)
                    if step["status"] != "passed":
                        raise ValueError(f"{name}: {label} failed; see {step['log']}")
            if args.mode in ("build", "verify", "artifacts"):
                result["artifacts"] = artifact_inventory(repo, info)
            result["status"] = "passed"
        except KeyboardInterrupt:
            result.update(status="interrupted", error="Verification interrupted by user")
            interrupted = True
        except (OSError, ValueError, KeyError, tarfile.TarError, zipfile.BadZipFile) as exc:
            result.update(status="failed", error=str(exc))
            print(str(exc), file=sys.stderr)
        write_report(destination, report)
        if interrupted:
            break
    report["complete"] = not interrupted
    report["success"] = not interrupted and all(p["status"] == "passed" for p in report["projects"])
    write_report(destination, report)
    print(f"Report: {destination}")
    return 130 if interrupted else 0 if report["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
