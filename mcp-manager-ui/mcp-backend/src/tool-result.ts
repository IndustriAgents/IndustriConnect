interface Envelope extends Record<string, unknown> {
    success: boolean;
}

function isEnvelope(value: unknown): value is Envelope {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return typeof record.success === 'boolean' &&
        'data' in record && 'error' in record && 'meta' in record;
}

/** Preserve the MCP payload while exposing application failures to the UI. */
export function normalizeToolResult(result: Record<string, unknown>): Record<string, unknown> {
    const candidates: unknown[] = [result, result.structuredContent];
    if (Array.isArray(result.content)) {
        for (const item of result.content) {
            if (item?.type !== 'text' || typeof item.text !== 'string') continue;
            try {
                candidates.push(JSON.parse(item.text));
            } catch {
                // Ordinary text is a valid MCP result, not a suite envelope.
            }
        }
    }

    const failure = candidates.filter(isEnvelope).find(value => !value.success);
    const isError = result.isError === true || result.success === false || Boolean(failure);
    const error = typeof failure?.error === 'string' ? failure.error : result.error;

    return {
        ...result,
        success: !isError,
        isError,
        ...(typeof error === 'string' ? { error } : {}),
    };
}
