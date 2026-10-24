import assert from 'node:assert/strict';
import { test } from 'node:test';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  sent: any[] = [];
  failSend = false;
  constructor(_url: string) { FakeSocket.instances.push(this); }
  send(data: string) {
    if (this.failSend) throw new Error('Socket closed');
    this.sent.push(JSON.parse(data));
  }
  reply(request: any, result: unknown) {
    this.onmessage?.({ data: JSON.stringify({
      ...request, type: 'tool_result', success: true, result,
    }) });
  }
}

Object.defineProperty(globalThis, 'WebSocket', { value: FakeSocket, configurable: true });
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
const { MCPClientManager } = await import('../src/utils/mcp-client.ts');

function connected() {
  const manager = new MCPClientManager();
  const socket = FakeSocket.instances.at(-1)!;
  socket.onopen?.();
  manager.addServer({
    id: 'fixture', name: 'Fixture', status: 'connected',
    config: { command: 'fixture', args: [] },
  });
  return { manager, socket };
}

test('concurrent calls to the same tool receive only their own result', async () => {
  const { manager, socket } = connected();
  const first = manager.callTool('fixture', 'read', { address: 1 });
  const second = manager.callTool('fixture', 'read', { address: 2 });
  assert.notEqual(socket.sent[0].requestId, socket.sent[1].requestId);
  socket.reply(socket.sent[1], { content: [{ type: 'text', text: 'second' }] });
  socket.reply(socket.sent[0], { content: [{ type: 'text', text: 'first' }] });
  assert.equal((await first).content![0].text, 'first');
  assert.equal((await second).content![0].text, 'second');
});

test('late and uncorrelated replies cannot satisfy a new call after timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { manager, socket } = connected();
  const first = manager.callTool('fixture', 'write', { value: 1 });
  const timedOut = assert.rejects(first, /delivery and outcome are unknown/);
  t.mock.timers.tick(30000);
  await timedOut;

  let settled = false;
  const second = manager.callTool('fixture', 'write', { value: 2 });
  void second.then(() => { settled = true; });
  socket.reply(socket.sent[0], { content: [{ type: 'text', text: 'stale' }] });
  socket.reply({ serverId: 'fixture', toolName: 'write' }, { content: [] });
  await Promise.resolve();
  assert.equal(settled, false);
  socket.reply(socket.sent[1], { content: [{ type: 'text', text: 'current' }] });
  assert.equal((await second).content![0].text, 'current');
  t.mock.timers.tick(30000);
});

test('a failed request does not reject another call to the same tool', async () => {
  const { manager, socket } = connected();
  const first = manager.callTool('fixture', 'read', {});
  const rejected = assert.rejects(first, /device unavailable/);
  const second = manager.callTool('fixture', 'read', {});
  socket.onmessage?.({ data: JSON.stringify({
    ...socket.sent[0], type: 'tool_result', success: false, error: 'device unavailable',
  }) });
  socket.reply(socket.sent[1], { content: [{ type: 'text', text: 'ok' }] });
  await rejected;
  assert.equal((await second).content![0].text, 'ok');
});

test('a synchronous send failure rejects and releases the request listener', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { manager, socket } = connected();
  socket.failSend = true;
  await assert.rejects(manager.callTool('fixture', 'read', {}), /Socket closed/);
  socket.failSend = false;
  const next = manager.callTool('fixture', 'read', {});
  socket.reply(socket.sent[0], { content: [] });
  assert.deepEqual(await next, { content: [] });
  t.mock.timers.tick(30000);
});
