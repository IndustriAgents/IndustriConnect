import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { MCPWebSocketServer } from '../src/websocket-server.js';

test('WebSocket tool replies preserve request IDs on success and failure', async t => {
  const server = createServer();
  const gateway = new MCPWebSocketServer(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  t.after(async () => {
    socket.terminate();
    await (gateway as any).mcpManager.cleanup();
    await new Promise<void>(resolve => (gateway as any).wss.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  await once(socket, 'open');

  const responses: any[] = [];
  socket.on('message', data => responses.push(JSON.parse(data.toString())));
  async function responseFor(type: string, requestId?: string) {
    for (;;) {
      const index = responses.findIndex(r => r.type === type && r.requestId === requestId);
      if (index >= 0) return responses.splice(index, 1)[0];
      await once(socket, 'message', { signal: AbortSignal.timeout(5000) });
    }
  }
  socket.send(JSON.stringify({
    type: 'spawn_server', serverId: 'fixture', serverName: 'Fixture',
    config: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./fixtures/stdio-server.mjs', import.meta.url))],
    },
  }));
  assert.equal((await responseFor('server_spawned')).status, 'connected');

  socket.send(JSON.stringify({ type: 'call_tool', requestId: 'read-1', serverId: 'fixture', toolName: 'echo', arguments: { text: 'hello' } }));
  const success = await responseFor('tool_result', 'read-1');
  assert.equal(success.success, true);
  assert.equal(success.result.content[0].text, 'hello');

  socket.send(JSON.stringify({ type: 'call_tool', requestId: 'read-2', serverId: 'missing', toolName: 'echo', arguments: {} }));
  const failed = await responseFor('tool_result', 'read-2');
  assert.equal(failed.success, false);
  assert.match(failed.error, /not found/);

  // Older clients still receive uncorrelated responses; updated clients
  // intentionally refuse these rather than guessing which call they belong to.
  socket.send(JSON.stringify({ type: 'call_tool', serverId: 'fixture', toolName: 'echo', arguments: { text: 'legacy' } }));
  const legacy = await responseFor('tool_result');
  assert.equal(legacy.result.content[0].text, 'legacy');
});
