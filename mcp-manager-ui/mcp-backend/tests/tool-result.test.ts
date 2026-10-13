import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeToolResult } from '../src/tool-result.js';

const refusedWrite = {
    success: false,
    data: null,
    error: 'Writes are disabled by configuration',
    meta: { outcome: 'not_sent', request_sent: false },
};

test('a refused write is an application error even when MCP transport succeeded', () => {
    const wire = {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(refusedWrite) }],
        structuredContent: refusedWrite,
    };
    const result = normalizeToolResult(wire);
    assert.equal(result.success, false);
    assert.equal(result.isError, true);
    assert.equal(result.error, refusedWrite.error);
    assert.equal(result.structuredContent, refusedWrite);
    assert.equal(result.content, wire.content);
    assert.equal(wire.isError, false);
});

test('older text-only results retain failure and uncertain-write metadata', () => {
    const unknownWrite = {
        ...refusedWrite,
        error: 'Reply lost; the write may have been applied',
        meta: { outcome: 'unknown', request_sent: true },
    };
    const content = [
        { type: 'text', text: 'Controller response follows' },
        { type: 'text', text: JSON.stringify(unknownWrite) },
    ];
    const result = normalizeToolResult({ content });
    assert.equal(result.success, false);
    assert.equal(result.isError, true);
    assert.equal(result.error, unknownWrite.error);
    assert.equal(result.content, content);
});

test('successful reads remain successful, including data with its own success field', () => {
    const envelope = { success: true, data: { success: false, value: 42 }, error: null, meta: {} };
    const result = normalizeToolResult({ structuredContent: envelope });
    assert.equal(result.success, true);
    assert.equal(result.isError, false);
    assert.equal(result.structuredContent, envelope);
});

test('protocol errors cannot be hidden by a successful application envelope', () => {
    const result = normalizeToolResult({
        isError: true,
        structuredContent: { success: true, data: null, error: null, meta: {} },
    });
    assert.equal(result.success, false);
    assert.equal(result.isError, true);
});

test('plain text and other JSON payloads keep their MCP meaning', () => {
    const content = [
        { type: 'text', text: 'Device ready' },
        { type: 'text', text: '{invalid JSON' },
        { type: 'text', text: '{"success":false,"measurements":[]}' },
    ];
    const result = normalizeToolResult({ content });
    assert.equal(result.success, true);
    assert.equal(result.isError, false);
    assert.equal(result.content, content);
});
