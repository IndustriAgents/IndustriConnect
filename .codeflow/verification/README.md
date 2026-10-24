# IndustriConnect automated verification

Code Flow reads `../config.json` for this repository's setup and check commands.
Both use the same locally built Docker image; it is not downloaded from a registry. Test execution has no external network,
host home directory, credentials, or Docker socket. Only the selected host worktree is
mounted writable; Git metadata is mounted read-only. Temporary files and
dependency caches inside the disposable container remain writable. Local brokers and OPC UA mocks run
inside the container. Missing broker/tool dependencies fail their required suites.
The repository allows up to 45 minutes per setup/check command for the protocol
suite; explicit per-run timeouts take precedence.

The check includes frontend and backend tests and both app builds, MQTT contract and broker
integration tests, OPC UA generated contracts, the Node build/unit suite, and the
Python unit/end-to-end protocol suite. It does not replace the upstream release
packaging or cross-platform dependency matrices.

Prepare dependencies from a clean, committed source worktree with its submodules
initialized (`git submodule update --init --recursive`). The builder rejects
modified tracked files and missing submodule checkouts:

```sh
python3 .codeflow/verification/build-image.py /absolute/path/to/clean/pr/worktree
```

Only tracked application/protocol files enter the build context; Git metadata and
environment files are excluded. Dependency acquisition happens while building the
image, in Docker. Setup then installs from its offline npm/uv caches using the
source checkout's lockfiles. A new uncached dependency fails setup: rebuild the
image for that revision rather than allowing network access during verification.

The builder defaults to the image tag in `../config.json`. Build from the failing
run's worktree so its application and submodule lockfiles are all cached. For a
different tag, pass `--tag` and update `image` in the config after the build passes.
Then resume the failed run; setup retries with the updated image. An npm
`ENOTCACHED` error means the image lacks a dependency from that checkout, so
resuming without rebuilding the image will fail again.

Code Flow invokes setup and check automatically. To run them manually from a
worktree, run `python3 .codeflow/verification/run.py setup`, then the same command
with `check`, from its root. The wrappers use that checkout's configuration and
mount its repository root, even if invoked from a nested working directory.
They verify the files currently in the selected checkout; they do not fetch PRs,
change revisions, publish reviews, merge, or modify CI.

The Python wrapper tests need only Git and Python, without Docker or a protocol
suite: `python3 -m unittest discover -s .codeflow/verification/tests -v`.
