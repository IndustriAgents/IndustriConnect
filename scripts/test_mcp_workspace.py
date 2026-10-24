"""Regression checks for stale distributables and build failure reporting."""

import contextlib
import io
import json
import os
import signal
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import mcp_workspace as workspace


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.patch = patch.object(workspace, "ROOT", self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.repo = self.root / "BACnet-MCP"
        self.python = self.repo / "bacnet-python"
        self.source = self.python / "src/bacnet_mcp"
        for directory in (
            self.source,
            self.repo / "contract",
            self.repo / "npm",
            self.repo / "dist",
        ):
            directory.mkdir(parents=True)
        self.package = {"name": "industriagents-bacnet-mcp", "version": "0.3.0"}
        (self.repo / "npm/package.json").write_text(json.dumps(self.package))
        (self.repo / "contract/tools.json").write_text(json.dumps({"tools": [{"name": "ping"}]}))
        (self.python / "pyproject.toml").write_text(
            '[project]\nname="industriagents-bacnet-mcp"\nversion="0.3.0"\n'
            '[project.scripts]\nbacnet-mcp="bacnet_mcp.cli:main"\n'
        )
        (self.source / "__init__.py").write_text('"""Test MCP."""\n')
        (self.repo / "npm/bin").mkdir()
        (self.repo / "npm/bin/cli.mjs").write_text("// Test launcher.\n")
        self.info = workspace.project(self.repo)

    def artifacts(self):
        wheel = self.repo / "dist/industriagents_bacnet_mcp-0.3.0-py3-none-any.whl"
        with zipfile.ZipFile(wheel, "w") as archive:
            archive.write(self.source / "__init__.py", "bacnet_mcp/__init__.py")
            archive.write(self.repo / "contract/tools.json", "bacnet_mcp/_contract/tools.json")
        with tarfile.open(
            self.repo / "dist/industriagents_bacnet_mcp-0.3.0.tar.gz", "w:gz"
        ) as archive:
            prefix = "industriagents_bacnet_mcp-0.3.0/"
            archive.add(self.python / "pyproject.toml", prefix + "pyproject.toml")
            archive.add(self.source / "__init__.py", prefix + "src/bacnet_mcp/__init__.py")
            archive.add(
                self.repo / "contract/tools.json", prefix + "src/bacnet_mcp/_contract/tools.json"
            )
        with tarfile.open(self.repo / "npm/industriagents-bacnet-mcp-0.3.0.tgz", "w:gz") as archive:
            archive.add(wheel, "package/vendor/" + wheel.name)
            archive.add(self.repo / "npm/package.json", "package/package.json")
            archive.add(self.repo / "npm/bin/cli.mjs", "package/bin/cli.mjs")

    def test_artifact_hashes_and_embedded_wheel(self):
        self.artifacts()
        inventory = workspace.artifact_inventory(self.repo, self.info)
        self.assertEqual(len(inventory), 3)
        self.assertTrue(all(len(item["sha256"]) == 64 for item in inventory))

    def test_stale_implementation_is_rejected_even_with_matching_version(self):
        self.artifacts()
        (self.source / "__init__.py").write_text('"""Changed after build."""\n')
        with self.assertRaisesRegex(ValueError, "stale wheel source"):
            workspace.artifact_inventory(self.repo, self.info)

    def test_stale_contract_is_rejected(self):
        self.artifacts()
        (self.repo / "contract/tools.json").write_text('{"tools": []}')
        with self.assertRaisesRegex(ValueError, "wheel contract differs"):
            workspace.artifact_inventory(self.repo, self.info)

    def test_npm_must_embed_identical_wheel(self):
        self.artifacts()
        with zipfile.ZipFile(
            self.repo / "dist/industriagents_bacnet_mcp-0.3.0-py3-none-any.whl", "a"
        ) as archive:
            archive.writestr("extra.txt", "change archive bytes")
        with self.assertRaisesRegex(ValueError, "exact verified wheel"):
            workspace.artifact_inventory(self.repo, self.info)

    def test_stale_source_distribution_is_rejected(self):
        self.artifacts()
        path = self.python / "pyproject.toml"
        path.write_text(path.read_text() + '\n[build-system]\nrequires=["hatchling"]\n')
        with self.assertRaisesRegex(ValueError, "stale source distribution"):
            workspace.artifact_inventory(self.repo, self.info)

    def test_deleted_python_file_cannot_survive_in_wheel(self):
        self.artifacts()
        (self.source / "__init__.py").unlink()
        with self.assertRaisesRegex(ValueError, "wheel Python file set differs"):
            workspace.artifact_inventory(self.repo, self.info)

    def test_stale_npm_launcher_is_rejected(self):
        self.artifacts()
        (self.repo / "npm/bin/cli.mjs").write_text("// Updated launcher.\n")
        with self.assertRaisesRegex(ValueError, "stale npm launcher"):
            workspace.artifact_inventory(self.repo, self.info)

    def test_deleted_npm_launcher_cannot_survive_in_tarball(self):
        self.artifacts()
        (self.repo / "npm/bin/cli.mjs").unlink()
        with self.assertRaisesRegex(ValueError, "npm launcher file set differs"):
            workspace.artifact_inventory(self.repo, self.info)

    def test_package_version_drift_is_rejected(self):
        (self.repo / "npm/package.json").write_text(json.dumps({**self.package, "version": "1.0"}))
        with self.assertRaisesRegex(ValueError, "metadata differ"):
            workspace.project(self.repo)

    def test_failed_command_is_reported_and_stops_project(self):
        commands = [
            ("failure", self.repo, [sys.executable, "-c", "raise SystemExit(7)"]),
            ("must-not-run", self.repo, [sys.executable, "-c", "pass"]),
        ]
        with patch.object(workspace, "steps", return_value=iter(commands)):
            with (
                contextlib.redirect_stdout(io.StringIO()),
                contextlib.redirect_stderr(io.StringIO()),
            ):
                code = workspace.main(["check", "BACnet-MCP"])
        self.assertEqual(code, 1)
        report = json.loads((self.root / ".build/check.json").read_text())
        self.assertFalse(report["success"])
        self.assertEqual(len(report["projects"][0]["steps"]), 1)
        self.assertEqual(report["projects"][0]["steps"][0]["exit_code"], 7)

    def test_timeout_is_reported(self):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = workspace.run_step(
                self.repo,
                "timeout",
                self.repo,
                [sys.executable, "-c", "import time; time.sleep(30)"],
                0.1,
            )
        self.assertEqual(result["exit_code"], 124)

    @unittest.skipUnless(os.name == "posix", "POSIX process-group cleanup")
    def test_interruption_kills_active_process_group(self):
        process = MagicMock(pid=123456)
        process.wait.side_effect = [KeyboardInterrupt(), 0]
        with (
            patch.object(workspace.subprocess, "Popen", return_value=process),
            patch.object(workspace.os, "killpg") as kill,
        ):
            with self.assertRaises(KeyboardInterrupt):
                workspace.run_step(self.repo, "interrupted", self.repo, ["test-command"], 30)
        kill.assert_called_once_with(process.pid, signal.SIGKILL)
        self.assertEqual(process.wait.call_count, 2)

    def test_completed_steps_survive_interruption(self):
        commands = [
            ("first", self.repo, ["first"]),
            ("second", self.repo, ["second"]),
        ]

        def run_step(repo, name, cwd, command, timeout):
            checkpoint = json.loads((self.root / ".build/check.json").read_text())
            self.assertFalse(checkpoint["success"])
            self.assertFalse(checkpoint["complete"])
            self.assertEqual(checkpoint["projects"][0]["active_step"], name)
            if name == "second":
                self.assertEqual(len(checkpoint["projects"][0]["steps"]), 1)
                raise KeyboardInterrupt()
            return {"name": name, "status": "passed", "exit_code": 0}

        with (
            patch.object(workspace, "steps", return_value=iter(commands)),
            patch.object(workspace, "run_step", side_effect=run_step),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(workspace.main(["check", "BACnet-MCP"]), 130)
        report = json.loads((self.root / ".build/check.json").read_text())
        self.assertFalse(report["complete"])
        self.assertEqual(report["projects"][0]["status"], "interrupted")
        self.assertEqual(len(report["projects"][0]["steps"]), 1)

    def test_timeout_must_be_finite(self):
        for value in ("nan", "inf", "-inf"):
            with self.subTest(value=value), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as raised:
                    workspace.main(["inventory", "--timeout=" + value])
                self.assertEqual(raised.exception.code, 2)

    def test_umbrella_submodule_layout_and_alias_are_supported(self):
        self.repo.rename(self.root / "BACnet-Project")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(workspace.main(["inventory", "BACnet-Project"]), 0)
        report = json.loads((self.root / ".build/inventory.json").read_text())
        self.assertEqual(report["projects"][0]["repository"], "BACnet-MCP")
        self.assertEqual(report["projects"][0]["project"], "BACnet-Project/bacnet-python")

    def test_independent_checkout_is_preferred_if_both_layouts_exist(self):
        (self.root / "BACnet-Project").mkdir()
        self.assertEqual(workspace.repository_path("BACnet-MCP"), self.repo)


if __name__ == "__main__":
    unittest.main()
