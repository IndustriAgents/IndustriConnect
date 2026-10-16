import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MCPServerManager } from '../src/mcp-manager.js';

const fixture = fileURLToPath(new URL('./fixtures/stdio-server.mjs', import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), 'mcp-manager-test-'));
test.after(() => rmSync(tempDir, { recursive: true, force: true }));

let pidCounter = 0;

function fixtureConfig(mode = 'normal') {
    const pidFile = join(tempDir, `pid-${pidCounter++}`);
    return {
        pidFile,
        config: {
            command: process.execPath,
            args: [fixture],
            env: { FIXTURE_MODE: mode, FIXTURE_PID_FILE: pidFile },
        },
    };
}

function isAlive(pidFile: string): boolean {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function connected(t: test.TestContext, mode = 'normal') {
    const manager = new MCPServerManager();
    t.after(() => manager.cleanup());
    const { config, pidFile } = fixtureConfig(mode);
    const spawned = await manager.spawnServer('fixture', 'Fixture', config);
    assert.equal(spawned.success, true, spawned.error);
    return { manager, spawned, pidFile };
}

test('connects, discovers tools, calls a tool and disconnects the process', async t => {
    const { manager, spawned, pidFile } = await connected(t);

    assert.equal(manager.getServerStatus('fixture'), 'connected');
    const echo = spawned.tools?.find(tool => tool.name === 'echo');
    assert.deepEqual(echo, {
        name: 'echo',
        description: 'Echo text',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    });
    assert.deepEqual(await manager.listTools('fixture'), spawned.tools);

    const result = await manager.callTool('fixture', 'echo', { text: 'hello' });
    assert.equal(result.success, true);
    assert.equal(result.isError, false);
    assert.deepEqual(result.content, [{ type: 'text', text: 'hello' }]);

    await manager.disconnectServer('fixture');
    assert.equal(manager.getServerStatus('fixture'), 'disconnected');
    assert.equal(isAlive(pidFile), false);
    await assert.rejects(manager.callTool('fixture', 'echo', {}), /not found/);
});

test('a server exiting mid-request rejects the call and removes the server', async t => {
    const { manager } = await connected(t);

    await assert.rejects(manager.callTool('fixture', 'crash', {}), /Connection closed/);
    assert.equal(manager.getServerStatus('fixture'), 'disconnected');
    await assert.rejects(manager.listTools('fixture'), /not found/);
});

test('a server exiting before initialization reports a failed spawn', async () => {
    const manager = new MCPServerManager();
    const { config } = fixtureConfig('exit-before-init');
    const spawned = await manager.spawnServer('fixture', 'Fixture', config);
    assert.equal(spawned.success, false);
    assert.match(spawned.error ?? '', /Connection closed/);
    assert.equal(manager.getServerStatus('fixture'), 'disconnected');
});

test('a rejected initialization waits for the still-running server to exit', async () => {
    const manager = new MCPServerManager();
    const { config, pidFile } = fixtureConfig('reject-init');
    const spawned = await manager.spawnServer('fixture', 'Fixture', config);
    assert.equal(spawned.success, false);
    assert.match(spawned.error ?? '', /protocol version is not supported/);
    assert.equal(manager.getServerStatus('fixture'), 'disconnected');
    assert.equal(isAlive(pidFile), false);
});

test('a missing executable reports a failed spawn', async () => {
    const manager = new MCPServerManager();
    const spawned = await manager.spawnServer('fixture', 'Fixture', {
        command: join(tempDir, 'does-not-exist'),
        args: [],
    });
    assert.equal(spawned.success, false);
    assert.match(spawned.error ?? '', /ENOENT/);
    assert.equal(manager.getServerStatus('fixture'), 'disconnected');
});

test('failed tool discovery stops the partially initialized server', async () => {
    const manager = new MCPServerManager();
    const { config, pidFile } = fixtureConfig('fail-discovery');
    const spawned = await manager.spawnServer('fixture', 'Fixture', config);
    assert.equal(spawned.success, false);
    assert.match(spawned.error ?? '', /Tool discovery unavailable/);
    assert.equal(manager.getServerStatus('fixture'), 'disconnected');
    assert.equal(isAlive(pidFile), false);
});

test('valid structured output is returned unchanged', async t => {
    const { manager } = await connected(t);

    const result = await manager.callTool('fixture', 'read_register', {});
    assert.equal(result.success, true);
    assert.deepEqual(result.structuredContent, { success: true, data: { value: 42 }, error: null, meta: {} });
});

test('structured output that violates the advertised schema is rejected', async t => {
    const { manager } = await connected(t);

    await assert.rejects(
        manager.callTool('fixture', 'malformed_read', {}),
        /does not match the tool's output schema/
    );
    await assert.rejects(
        manager.callTool('fixture', 'missing_structured', {}),
        /did not return structured content/
    );
    // A rejected result is a per-call failure, not a broken connection
    assert.equal(manager.getServerStatus('fixture'), 'connected');
});

test('a refused write keeps its structured envelope and is reported as an error', async t => {
    const { manager } = await connected(t);

    const result = await manager.callTool('fixture', 'write_register', {});
    assert.equal(result.success, false);
    assert.equal(result.isError, true);
    assert.equal(result.error, 'Writes are disabled by configuration');
    assert.deepEqual(result.structuredContent, {
        success: false,
        data: null,
        error: 'Writes are disabled by configuration',
        meta: { outcome: 'not_sent', request_sent: false },
    });
    assert.equal((result.content as unknown[]).length, 1);
});

test('a text-only legacy uncertain write keeps its failure metadata', async t => {
    const { manager } = await connected(t);

    const result = await manager.callTool('fixture', 'legacy_write', {});
    assert.equal(result.success, false);
    assert.equal(result.isError, true);
    assert.equal(result.error, 'Reply lost; the write may have been applied');
    assert.equal(result.structuredContent, undefined);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.deepEqual(JSON.parse(content[1].text).meta, { outcome: 'unknown', request_sent: true });
});
