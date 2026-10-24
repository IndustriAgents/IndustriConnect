"""Exercise wrapper boundaries without Docker, downloads or protocol suites."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]


class WrapperTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.source = self.root / "source"
        self.source.mkdir()
        self.log = self.root / "docker.json"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        docker = self.bin / "docker"
        docker.write_text(
            f"#!{sys.executable}\n"
            "import json, os, pathlib, sys\n"
            "result = {'args': sys.argv[1:]}\n"
            "if sys.argv[1] == 'build':\n"
            "    context = pathlib.Path(sys.argv[-1])\n"
            "    result['files'] = sorted(str(p.relative_to(context)) "
            "for p in context.rglob('*') if p.is_file())\n"
            "pathlib.Path(os.environ['CODEFLOW_TEST_LOG']).write_text(json.dumps(result))\n"
            "sys.exit(int(os.environ.get('CODEFLOW_TEST_EXIT', '0')))\n"
        )
        docker.chmod(0o755)
        self.env = dict(
            os.environ,
            PATH=f"{self.bin}{os.pathsep}{os.environ['PATH']}",
            CODEFLOW_TEST_LOG=str(self.log),
        )
        self.init(self.source)
        self.write(self.source / "mcp-manager-ui/package.json", "{}\n")
        self.commit(self.source)

    def git(self, path, *args):
        return subprocess.check_output(
            ["git", *args], cwd=path, text=True, stderr=subprocess.DEVNULL
        ).strip()

    def init(self, path):
        self.git(path, "init", "-q")
        self.git(path, "config", "user.email", "test@example.invalid")
        self.git(path, "config", "user.name", "Verification test")

    def write(self, path, text):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def commit(self, path):
        self.git(path, "add", ".")
        self.git(path, "commit", "-qm", "Fixture")

    def protocols(self):
        for name in ("MQTT-Project", "OPCUA-Project"):
            path = self.source / name
            path.mkdir()
            self.init(path)
            self.write(path / "tracked.txt", "fixture")
            self.commit(path)
        self.commit(self.source)

    def run_script(self, name, *args, cwd=None, env=None):
        return subprocess.run(
            [sys.executable, str(SCRIPTS / name), *map(str, args)],
            cwd=cwd or self.source,
            env=env or self.env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_missing_submodule_fails_before_docker(self):
        (self.source / "MQTT-Project").mkdir()
        result = self.run_script("build-image.py", self.source)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Not an initialized checkout", result.stderr)
        self.assertFalse(self.log.exists())

    def test_dirty_tracked_source_fails_before_docker(self):
        self.protocols()
        self.write(self.source / "mcp-manager-ui/package.json", '{"changed": true}\n')
        result = self.run_script("build-image.py", self.source)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Tracked changes", result.stderr)
        self.assertFalse(self.log.exists())

    def test_context_contains_tracked_sources_without_env_or_untracked_files(self):
        self.protocols()
        self.write(self.source / "mcp-manager-ui/.env", "FIXTURE=not-a-secret")
        self.write(self.source / "mcp-manager-ui/.env.local", "FIXTURE=not-a-secret")
        self.commit(self.source)
        self.write(self.source / "mcp-manager-ui/untracked.txt", "local only")
        result = self.run_script(
            "build-image.py", self.source, "--tag", "fixture:local"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        observed = json.loads(self.log.read_text())
        self.assertIn("fixture:local", observed["args"])
        self.assertIn("source/mcp-manager-ui/package.json", observed["files"])
        self.assertIn("source/MQTT-Project/tracked.txt", observed["files"])
        self.assertIn("source/OPCUA-Project/tracked.txt", observed["files"])
        self.assertFalse(
            any(
                ".env" in p or "untracked" in p or "/.git/" in p
                for p in observed["files"]
            )
        )

    def assert_run_mounts(self, worktree, common):
        nested = worktree / "mcp-manager-ui"
        result = self.run_script(
            "run.py", "check", cwd=nested, env=dict(self.env, CODEFLOW_TEST_EXIT="23")
        )
        self.assertEqual(result.returncode, 23, result.stderr)
        args = json.loads(self.log.read_text())["args"]
        self.assertIn(f"{worktree}:{worktree}", args)
        self.assertIn(f"{common}:{common}:ro", args)
        self.assertEqual(args[args.index("-w") + 1], str(worktree))
        self.assertIn("--network=none", args)
        self.assertEqual(args[-1], "industriconnect-check")

    def test_nested_invocation_uses_repository_root(self):
        self.assert_run_mounts(self.source, self.source / ".git")

    def test_linked_worktree_mounts_shared_git_metadata_read_only(self):
        worktree = self.root / "linked"
        self.git(
            self.source, "worktree", "add", "-q", "-b", "fixture-linked", str(worktree)
        )
        self.assert_run_mounts(worktree, self.source / ".git")

    def test_invalid_mode_does_not_invoke_docker(self):
        result = self.run_script("run.py", "publish")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage", result.stderr)
        self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()
