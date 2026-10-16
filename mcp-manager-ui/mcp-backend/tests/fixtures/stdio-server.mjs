// Minimal stdio MCP server used by mcp-manager tests.
// Uses the low-level Server so it can return results that McpServer would reject.
import { writeFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const mode = process.env.FIXTURE_MODE ?? 'normal';
if (process.env.FIXTURE_PID_FILE) writeFileSync(process.env.FIXTURE_PID_FILE, String(process.pid));
if (mode === 'exit-before-init') process.exit(3);
if (mode === 'reject-init') {
    // Answer initialize with an unsupported protocol version and stay alive,
    // exiting slowly once stdin closes so callers must wait for termination.
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
            const message = JSON.parse(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            if (message.method !== 'initialize') continue;
            process.stdout.write(JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                result: {
                    protocolVersion: '1999-01-01',
                    capabilities: {},
                    serverInfo: { name: 'fixture', version: '1.0.0' },
                },
            }) + '\n');
        }
    });
    process.stdin.on('end', () => setTimeout(() => process.exit(0), 500));
}

const envelopeSchema = {
    type: 'object',
    properties: {
        success: { type: 'boolean' },
        data: {},
        error: { type: ['string', 'null'] },
        meta: { type: 'object' },
    },
    required: ['success', 'data', 'error', 'meta'],
};

const refusedWrite = {
    success: false,
    data: null,
    error: 'Writes are disabled by configuration',
    meta: { outcome: 'not_sent', request_sent: false },
};

const unknownWrite = {
    success: false,
    data: null,
    error: 'Reply lost; the write may have been applied',
    meta: { outcome: 'unknown', request_sent: true },
};

const tools = [
    { name: 'echo', description: 'Echo text', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
    { name: 'read_register', inputSchema: { type: 'object' }, outputSchema: envelopeSchema },
    { name: 'write_register', inputSchema: { type: 'object' }, outputSchema: envelopeSchema },
    { name: 'malformed_read', inputSchema: { type: 'object' }, outputSchema: envelopeSchema },
    { name: 'missing_structured', inputSchema: { type: 'object' }, outputSchema: envelopeSchema },
    { name: 'legacy_write', inputSchema: { type: 'object' } },
    { name: 'crash', inputSchema: { type: 'object' } },
];

const text = value => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }];

const handlers = {
    echo: args => ({ content: text(String(args.text ?? '')) }),
    read_register: () => {
        const envelope = { success: true, data: { value: 42 }, error: null, meta: {} };
        return { content: text(envelope), structuredContent: envelope };
    },
    write_register: () => ({ isError: false, content: text(refusedWrite), structuredContent: refusedWrite }),
    malformed_read: () => ({ content: text('bad'), structuredContent: { success: 'yes', data: null } }),
    missing_structured: () => ({ content: text({ success: true, data: 1, error: null, meta: {} }) }),
    legacy_write: () => ({ content: [...text('Controller response follows'), ...text(unknownWrite)] }),
    crash: () => {
        // Exit without replying, as a server killed mid-request would
        process.exit(1);
    },
};

const server = new Server({ name: 'fixture', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
    if (mode === 'fail-discovery') throw new Error('Tool discovery unavailable');
    return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
    const handler = handlers[request.params.name];
    if (!handler) throw new Error(`Unknown tool ${request.params.name}`);
    return handler(request.params.arguments ?? {});
});

if (mode !== 'reject-init') {
    process.stdin.on('end', () => process.exit(0));
    await server.connect(new StdioServerTransport());
}
