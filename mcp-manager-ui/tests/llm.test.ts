import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import type { CloudProvider } from '../src/types';
import type { MCPServer, MCPToolCallResult } from '../src/types/mcp-types';

// Import the browser client without opening a real websocket. All HTTP and MCP
// calls below are mocked; the tests never contact cloud providers or devices.
const originalWebSocket = globalThis.WebSocket;
globalThis.WebSocket = class {} as typeof WebSocket;
const { mcpClientManager } = await import('../src/utils/mcp-client');
globalThis.WebSocket = originalWebSocket;
const { callCloudLLM, callOllama, isChatBackendReady } = await import('../src/utils/llm');

type Provider = CloudProvider | 'ollama';
const providers: Provider[] = ['openai', 'gemini', 'anthropic', 'ollama'];
const messages = [{ id: 'user-1', role: 'user' as const, content: 'Read the second PLC.', timestamp: new Date() }];
let servers: MCPServer[];
let dispatched: Array<{ serverId: string; name: string; args: unknown }>;
let result: MCPToolCallResult;

beforeEach(() => {
  servers = ['first', 'second'].map((name) => ({
    id: name, name, status: 'connected', config: { command: 'fixture', args: [] },
    tools: [{ name: 'read_register', description: 'Read a register.', inputSchema: { type: 'object' } }],
  }));
  dispatched = [];
  result = { success: true, content: [{ type: 'text', text: 'value=42' }, { type: 'text', text: 'unit=bar' }] };
  mock.method(mcpClientManager, 'getServers', () => servers);
  mock.method(mcpClientManager, 'callTool', async (serverId: string, name: string, args: unknown) => {
    dispatched.push({ serverId, name, args });
    return result;
  });
  mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected HTTP request'); });
});
afterEach(() => mock.restoreAll());

const invoke = (provider: Provider, model = 'test-model') => provider === 'ollama'
  ? callOllama(messages, { baseUrl: 'http://fixture.invalid', model })
  : callCloudLLM(messages, { provider, model, apiKey: 'test-only-key' });

const names = (provider: Provider, body: any): string[] => {
  if (provider === 'gemini') return body.tools[0].functionDeclarations.map((tool: any) => tool.name);
  if (provider === 'anthropic') return body.tools.map((tool: any) => tool.name);
  return body.tools.map((tool: any) => tool.function.name);
};
const toolReply = (provider: Provider, name: string, args: unknown = { address: 1 }, id = 'call-1') => {
  if (provider === 'gemini') return { candidates: [{ content: {
    role: 'model', parts: [{ functionCall: { name, args, id }, thoughtSignature: 'signature-preserved' }],
  } }] };
  if (provider === 'anthropic') return {
    stop_reason: 'tool_use', content: [{ type: 'tool_use', name, input: args, id }],
  };
  const message = { role: 'assistant', content: '', tool_calls: [{
    id, type: 'function', function: { name, arguments: provider === 'openai' && typeof args !== 'string' ? JSON.stringify(args) : args },
  }] };
  return provider === 'openai' ? { choices: [{ message }] } : { message };
};
const textReply = (provider: Provider, text = 'Pressure is 42 bar.') => {
  if (provider === 'gemini') return { candidates: [{ content: { role: 'model', parts: [{ text }] } }] };
  if (provider === 'anthropic') return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
  const message = { role: 'assistant', content: text };
  return provider === 'openai' ? { choices: [{ message }] } : { message };
};
const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const requests = (handler: (body: any, round: number, init: RequestInit) => Response | Promise<Response>) => {
  const bodies: any[] = [];
  mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    bodies.push(body);
    return handler(body, bodies.length, init);
  });
  return bodies;
};

for (const provider of providers) {
  test(`${provider}: qualified tools route duplicate names to the selected server and feed every result back`, async () => {
    const bodies = requests((body, round) => {
      const advertised = names(provider, body);
      assert.equal(new Set(advertised).size, 2);
      assert.ok(advertised.every((name) => /^[a-zA-Z0-9_-]{1,64}$/.test(name)));
      return respond(round < 3 ? toolReply(provider, advertised[1], { address: round }, `call-${round}`) : textReply(provider));
    });
    const reply = await invoke(provider);
    assert.deepEqual(dispatched, [
      { serverId: 'second', name: 'read_register', args: { address: 1 } },
      { serverId: 'second', name: 'read_register', args: { address: 2 } },
    ]);
    assert.equal(reply.content, 'Pressure is 42 bar.');
    assert.equal(reply.toolCalls?.length, 2);
    assert.equal(reply.toolCalls?.[0].serverName, 'second');
    assert.match(JSON.stringify(bodies[1]), /value=42/);
    assert.match(JSON.stringify(bodies[1]), /unit=bar/);
    assert.match(JSON.stringify(bodies[0]), /Never automatically retry/);
    if (provider === 'gemini') {
      assert.equal(bodies[1].contents[1].parts[0].thoughtSignature, 'signature-preserved');
      assert.equal(bodies[1].contents[2].parts[0].functionResponse.id, 'call-1');
    }
    if (provider === 'openai') assert.equal(bodies[1].messages.at(-1).tool_call_id, 'call-1');
    if (provider === 'ollama') assert.equal(bodies[1].messages.at(-1).tool_name, names(provider, bodies[0])[1]);
  });

  test(`${provider}: model failure after a tool call preserves evidence without repeating the call`, async () => {
    requests((body, round) => round === 1
      ? respond(toolReply(provider, names(provider, body)[1]))
      : new Response('rate limit reached', { status: 429 }));
    const reply = await invoke(provider);
    assert.equal(dispatched.length, 1);
    assert.equal(reply.error, true);
    assert.equal(reply.toolCalls?.length, 1);
    assert.match(reply.content, /rate limit reached/);
    assert.match(reply.content, /value=42/);
    assert.match(reply.content, /unit=bar/);
  });

  test(`${provider}: a transport failure is reported as unknown delivery`, async () => {
    mock.method(mcpClientManager, 'callTool', async () => { throw new Error('Socket closed'); });
    const bodies = requests((body, round) => respond(round === 1
      ? toolReply(provider, names(provider, body)[1]) : textReply(provider, 'Delivery is unknown.')));
    const reply = await invoke(provider);
    assert.equal(reply.toolCalls?.[0].result?.success, false);
    assert.deepEqual(reply.toolCalls?.[0].result?.result, {
      error: 'Socket closed. Delivery and outcome are unknown; a control may already have executed. Do not automatically retry it. Verify device state first.',
      outcome: 'unknown', request_sent: null,
    });
    assert.match(JSON.stringify(bodies[1]), /unknown/);
    if (provider === 'anthropic') assert.equal(bodies[1].messages.at(-1).content[0].is_error, true);
    if (provider === 'gemini') assert.match(bodies[1].contents.at(-1).parts[0].functionResponse.response.error, /unknown/);
  });

  for (const args of ['{"address":', 'null', [], null, 42]) {
    test(`${provider}: invalid arguments ${JSON.stringify(args)} never reach MCP`, async () => {
      requests((body, round) => respond(round === 1 ? toolReply(provider, names(provider, body)[1], args) : textReply(provider)));
      const reply = await invoke(provider);
      assert.equal(dispatched.length, 0);
      assert.equal(reply.toolCalls?.[0].result?.isError, true);
      assert.match(reply.toolCalls?.[0].result?.error || '', /arguments/);
      assert.equal((reply.toolCalls?.[0].result?.result as any).outcome, 'not_sent');
    });
  }

  test(`${provider}: unavailable snapshot tools are not rerouted to another server`, async () => {
    requests((body, round) => {
      if (round === 1) {
        const name = names(provider, body)[1];
        servers[1].status = 'disconnected';
        return respond(toolReply(provider, name));
      }
      return respond(textReply(provider));
    });
    const reply = await invoke(provider);
    assert.equal(dispatched.length, 0);
    assert.equal(reply.toolCalls?.[0].serverId, 'second');
    assert.match(reply.toolCalls?.[0].result?.error || '', /not available/);
  });

  test(`${provider}: unadvertised raw tool names cannot bypass server routing`, async () => {
    requests((_body, round) => respond(round === 1 ? toolReply(provider, 'read_register') : textReply(provider)));
    const reply = await invoke(provider);
    assert.equal(dispatched.length, 0);
    assert.equal(reply.toolCalls?.[0].result?.isError, true);
  });

  test(`${provider}: tool loops terminate after eight rounds and retain the last result`, async () => {
    const bodies = requests((body) => respond(toolReply(provider, names(provider, body)[1])));
    const reply = await invoke(provider);
    assert.equal(bodies.length, 8);
    assert.equal(dispatched.length, 8);
    assert.equal(reply.toolCalls?.length, 8);
    assert.equal(reply.error, true);
    assert.match(reply.content, /Stopped after 8/);
    assert.match(reply.content, /value=42/);
  });

  test(`${provider}: first-request errors remain errors with no claimed tool execution`, async () => {
    requests(() => new Response('unauthorized', { status: 401 }));
    await assert.rejects(invoke(provider), /unauthorized/);
    assert.equal(dispatched.length, 0);
  });
}

test('Anthropic: fallback retains the boundary and valid thinking, without dispatching discarded tools', async () => {
  const boundary = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } };
  const validThinking = { type: 'thinking', thinking: '', signature: 'valid-signature' };
  const bodies = requests((body, round, init) => {
    assert.equal((init.headers as any)['anthropic-beta'], 'server-side-fallback-2026-07-01');
    assert.equal(body.fallbacks, 'default');
    const name = names('anthropic', body)[1];
    return respond(round === 1 ? { stop_reason: 'tool_use', content: [
      { type: 'thinking', thinking: 'discarded', signature: 'old' },
      { type: 'connector_text', text: 'discarded' },
      { type: 'tool_use', name, input: { address: 99 }, id: 'discarded' },
      boundary, validThinking, { type: 'tool_use', name, input: { address: 1 }, id: 'kept' },
    ] } : textReply('anthropic'));
  });
  await invoke('anthropic', 'claude-opus-5-5');
  assert.deepEqual(dispatched.map((call) => call.args), [{ address: 1 }]);
  const echoed = bodies[1].messages[1].content;
  assert.deepEqual(echoed.slice(0, 2), [boundary, validThinking]);
  assert.equal(echoed.length, 3);
});

test('Anthropic: a refusal after tool execution preserves the tool evidence', async () => {
  requests((body, round) => respond(round === 1 ? toolReply('anthropic', names('anthropic', body)[0]) : {
    stop_reason: 'refusal', stop_details: { category: 'general_harms' }, content: [],
  }));
  const reply = await invoke('anthropic');
  assert.equal(reply.error, true);
  assert.equal(reply.toolCalls?.length, 1);
  assert.match(reply.content, /declined/);
  assert.match(reply.content, /value=42/);
});

test('readiness rejects whitespace-only model names and keys', () => {
  assert.equal(isChatBackendReady('cloud-llm', { provider: 'openai', model: 'gpt', apiKey: ' ' }, null), false);
  assert.equal(isChatBackendReady('cloud-llm', { provider: 'openai', model: ' ', apiKey: 'key' }, null), false);
  assert.equal(isChatBackendReady('ollama', null, { model: ' ', baseUrl: 'http://fixture.invalid' }), false);
});

for (const provider of providers) {
  test(`${provider}: multiple requested tools each receive their matching result`, async () => {
    const bodies = requests((body, round) => {
      if (round !== 1) return respond(textReply(provider));
      const advertised = names(provider, body);
      const first: any = toolReply(provider, advertised[0], { address: 1 }, 'first-call');
      const second: any = toolReply(provider, advertised[1], { address: 2 }, 'second-call');
      if (provider === 'gemini') first.candidates[0].content.parts.push(...second.candidates[0].content.parts);
      else if (provider === 'anthropic') first.content.push(...second.content);
      else if (provider === 'openai') first.choices[0].message.tool_calls.push(...second.choices[0].message.tool_calls);
      else first.message.tool_calls.push(...second.message.tool_calls);
      return respond(first);
    });
    const reply = await invoke(provider);
    assert.deepEqual(dispatched.map(({ serverId }) => serverId), ['first', 'second']);
    assert.deepEqual(reply.toolCalls?.map(({ id }) => id), ['first-call', 'second-call']);
    const followup = bodies[1];
    if (provider === 'gemini') assert.deepEqual(followup.contents.at(-1).parts.map((part: any) => part.functionResponse.id), ['first-call', 'second-call']);
    if (provider === 'anthropic') assert.deepEqual(followup.messages.at(-1).content.map((part: any) => part.tool_use_id), ['first-call', 'second-call']);
    if (provider === 'openai') assert.deepEqual(followup.messages.slice(-2).map((message: any) => message.tool_call_id), ['first-call', 'second-call']);
    if (provider === 'ollama') assert.deepEqual(followup.messages.slice(-2).map((message: any) => message.tool_name), names(provider, bodies[0]));
  });

  test(`${provider}: an empty final answer includes results even after a progress preamble`, async () => {
    requests((body, round) => {
      if (round !== 1) return respond(textReply(provider, ''));
      const first: any = toolReply(provider, names(provider, body)[0]);
      if (provider === 'gemini') first.candidates[0].content.parts.unshift({ text: 'Checking pressure.' });
      else if (provider === 'anthropic') first.content.unshift({ type: 'text', text: 'Checking pressure.' });
      else if (provider === 'openai') first.choices[0].message.content = 'Checking pressure.';
      else first.message.content = 'Checking pressure.';
      return respond(first);
    });
    const reply = await invoke(provider);
    assert.match(reply.content, /Checking pressure/);
    assert.match(reply.content, /value=42/);
    assert.match(reply.content, /unit=bar/);
  });
}
