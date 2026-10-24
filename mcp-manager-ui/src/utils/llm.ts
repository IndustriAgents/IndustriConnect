import {
  ChatBackend,
  ChatMessage,
  CloudLLMConfig,
  CloudProvider,
  OllamaConfig,
} from '../types';
import { MCPTool, MCPToolCall, MCPToolCallResult } from '../types/mcp-types';
import { mcpClientManager } from './mcp-client';

type LLMReply = { content: string; toolCalls?: MCPToolCall[]; error?: boolean };

interface RoutedMCPTool extends MCPTool {
  serverId: string;
  serverName: string;
  originalName: string;
}

/** Tool rounds per message before giving up. A model that is still calling
 *  tools after this many rounds is looping, not converging on an answer. */
const MAX_TOOL_ROUNDS = 8;

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export const CLOUD_PROVIDER_LABELS: Record<CloudProvider, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
};

/** Suggestions for the model field, first one is the default for a provider.
 *  The field takes any model id, so a newer model needs no code change. */
export const CLOUD_MODEL_SUGGESTIONS: Record<CloudProvider, string[]> = {
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
};

/** Claude models that take `fallbacks: "default"`: a request a safety
 *  classifier declines is re-run server-side on the model Anthropic recommends
 *  for that refusal category, instead of coming back as a refusal. */
const ANTHROPIC_SERVER_FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

/** The console shows replies exactly as written, so Markdown would arrive as
 *  literal asterisks and hashes. */
const CONSOLE_INSTRUCTION =
  'You are the assistant in an industrial operations console. Write plain text, not Markdown: ' +
  'the console shows your reply exactly as written, so no asterisks, hashes or tables. ' +
  'Short lines and simple dashes for lists are fine.';

const buildSystemMessage = (mcpTools: MCPTool[]): string => {
  if (mcpTools.length === 0) {
    return CONSOLE_INSTRUCTION;
  }

  return (
    CONSOLE_INSTRUCTION +
    '\n\n' +
    'You have access to external MCP tools for industrial protocols (MQTT, OPC UA, etc.). ' +
    'Use these tools whenever the user asks you to read, write, browse, or call methods on field devices, PLCs, or other industrial systems, ' +
    'instead of guessing. Once you have the tool results, answer the user in plain language: ' +
    'state the values with their units and mention anything that failed. ' +
    'A failed or timed-out control may already have executed. Never automatically retry a write, ' +
    'method call or other control when outcome is unknown, request_sent is null, or delivery is uncertain. ' +
    'Report that uncertainty and ask the operator to verify device state before another control.\n\n' +
    'OPC UA NodeId reminder: numeric ids use the form ns=<namespace>;i=<integer> (for example, ns=2;i=2). ' +
    'String ids must use ns=<namespace>;s=<string> (for example, ns=2;s=TEMP_NODE_ID). ' +
    'Never put non-numeric values after i=.\n\n' +
    'Available tools:\n' +
    mcpTools
      .map(
        (tool) =>
          `- ${tool.name}${tool.description ? `: ${tool.description}` : ''}`,
      )
      .join('\n')
  );
};

const createToolCallId = () =>
  `tool-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const parseToolArguments = (args: unknown): Record<string, unknown> => {
  let parsed = args;
  if (typeof args === 'string') {
    try {
      parsed = JSON.parse(args);
    } catch {
      throw new Error('Tool arguments must be valid JSON; the tool was not called.');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be an object; the tool was not called.');
  }
  return parsed as Record<string, unknown>;
};

const errorResult = (message: string, uncertain = false): MCPToolCallResult => {
  const result = {
    error: message,
    outcome: uncertain ? 'unknown' : 'not_sent',
    request_sent: uncertain ? null : false,
  };
  return {
    success: false,
    isError: true,
    error: message,
    result,
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
};

/**
 * Run one tool call the model asked for. Never throws: an unknown tool or a
 * failed call becomes an error result the model reads back, so a bad node id
 * or a refused write is something it can recover from rather than the end of
 * the request.
 */
const executeMCPToolCall = async (
  tools: RoutedMCPTool[],
  functionName: string,
  rawArgs: unknown,
  id?: string,
): Promise<MCPToolCall> => {
  const tool = tools.find((candidate) => candidate.name === functionName);
  const call: MCPToolCall = {
    id: id || createToolCallId(),
    toolName: tool?.originalName || functionName,
    serverId: tool?.serverId || '',
    serverName: tool?.serverName || '',
    arguments: {},
    timestamp: new Date(),
  };
  const server = tool && mcpClientManager.getServers().find(
    (candidate) => candidate.id === tool.serverId && candidate.status === 'connected',
  );
  if (!tool || !server || !server.tools?.some((candidate) => candidate.name === tool.originalName)) {
    return { ...call, result: errorResult(`Tool "${functionName}" is not available on its connected MCP server; the tool was not called.`) };
  }
  try {
    call.arguments = parseToolArguments(rawArgs);
  } catch (error) {
    return { ...call, result: errorResult((error as Error).message) };
  }
  try {
    const result = await mcpClientManager.callTool(tool.serverId, tool.originalName, call.arguments);
    return { ...call, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...call,
      result: errorResult(`${message}. Delivery and outcome are unknown; a control may already have executed. Do not automatically retry it. Verify device state first.`, true),
    };
  }
};

const isToolError = (toolCall: MCPToolCall) =>
  Boolean(toolCall.result?.isError || toolCall.result?.success === false);

/** What the model reads back from a tool: every text item, not only the first. */
const toolResultText = (toolCall: MCPToolCall): string => {
  const texts = (toolCall.result?.content || [])
    .map((item) => item.text)
    .filter((text): text is string => Boolean(text));
  if (texts.length > 0) return texts.join('\n');
  if (toolCall.result?.error) return toolCall.result.error;
  return JSON.stringify(toolCall.result ?? null);
};

const formatToolResults = (toolCalls: MCPToolCall[]) =>
  toolCalls
    .map((toolCall) => `Tool ${toolCall.serverName ? `${toolCall.serverName} / ` : ''}${toolCall.toolName} result: ${toolResultText(toolCall)}`)
    .join('\n\n');

/**
 * The reply once the model stops calling tools. Its own words are the answer;
 * the raw tool results are only a fallback for a model that went quiet after
 * its last tool call, so the operator still sees what came back.
 */
const finishReply = (texts: string[], toolCalls: MCPToolCall[], provider: string): LLMReply => {
  const content = texts.join('\n\n').trim() || formatToolResults(toolCalls);
  if (!content) {
    throw new Error(`${provider} returned an empty response`);
  }
  return toolCalls.length > 0 ? { content, toolCalls } : { content };
};

const interruptedReply = (
  error: unknown, texts: string[], toolCalls: MCPToolCall[], provider: string,
): LLMReply => {
  if (toolCalls.length === 0) throw error;
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...finishReply([
      ...texts,
      `${provider} could not finish the answer: ${message}. Completed tool calls are shown below; they have not been retried.`,
      formatToolResults(toolCalls),
    ], toolCalls, provider),
    error: true,
  };
};

const toolRoundsExhausted = (texts: string[], toolCalls: MCPToolCall[], provider: string) => ({
  ...finishReply(
    [...texts, `Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls without a final answer.`, formatToolResults(toolCalls)],
    toolCalls,
    provider,
  ),
  error: true,
});

const postJSON = async (
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: string,
): Promise<any> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${provider} error (${response.status})`);
  }

  return response.json();
};

const buildPromptFromMessages = (messages: ChatMessage[]): string => {
  const sorted = [...messages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  return sorted
    .map((message) => {
      const label =
        message.role === 'user'
          ? 'User'
          : message.role === 'assistant'
            ? 'Assistant'
            : 'System';
      return `${label}: ${message.content}`;
    })
    .join('\n\n');
};

const envApiKey = (provider: CloudProvider): string | undefined => {
  if (provider === 'openai') {
    return import.meta.env?.VITE_OPENAI_API_KEY as string | undefined;
  }
  if (provider === 'gemini') {
    return import.meta.env?.VITE_GEMINI_API_KEY as string | undefined;
  }
  return import.meta.env?.VITE_ANTHROPIC_API_KEY as string | undefined;
};

export const hasEnvApiKey = (provider: CloudProvider) => Boolean(envApiKey(provider)?.trim());

const getCloudApiKey = (config: CloudLLMConfig): string => {
  const key = config.apiKey?.trim() || envApiKey(config.provider)?.trim();

  if (!key) {
    throw new Error(
      'No API key configured. Set it in a .env file (VITE_OPENAI_API_KEY / VITE_GEMINI_API_KEY / VITE_ANTHROPIC_API_KEY) or enter it in the UI.',
    );
  }

  return key;
};

/** Whether a message can be sent with this backend as configured. */
export const isChatBackendReady = (
  backend: ChatBackend,
  cloudConfig: CloudLLMConfig | null,
  ollamaConfig: OllamaConfig | null,
): boolean => {
  if (backend === 'ollama') {
    return Boolean(ollamaConfig?.model.trim());
  }
  return Boolean(
    cloudConfig?.model.trim() &&
      (cloudConfig.apiKey?.trim() || hasEnvApiKey(cloudConfig.provider)),
  );
};

/** The model names an Ollama server has pulled, from its /api/tags. */
export const listOllamaModels = async (baseUrl: string): Promise<string[]> => {
  const response = await fetch(`${baseUrl.trim().replace(/\/+$/, '')}/api/tags`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  const data: any = await response.json();
  return Array.isArray(data?.models)
    ? data.models
        .map((model: any) => model?.name)
        .filter((name: unknown): name is string => typeof name === 'string')
    : [];
};

/**
 * Convert MCP tools to OpenAI function format
 */
const convertMCPToolsToOpenAI = (mcpTools: MCPTool[]) => {
  return mcpTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema,
    },
  }));
};

const convertMCPToolsToGemini = (mcpTools: MCPTool[]) => {
  return [
    {
      functionDeclarations: mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema,
      })),
    },
  ];
};

const convertMCPToolsToAnthropic = (mcpTools: MCPTool[]) => {
  return mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    input_schema: tool.inputSchema,
  }));
};

/**
 * Call OpenAI with support for MCP tools. Each round's tool results go back to
 * the model as `tool` messages until it answers in words.
 */
const callOpenAIChat = async (
  messages: ChatMessage[],
  config: CloudLLMConfig,
  mcpTools: RoutedMCPTool[] = [],
): Promise<LLMReply> => {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(
    /\/$/,
    '',
  );

  const apiKey = getCloudApiKey(config);

  // Convert chat messages to OpenAI format
  const toolSystemMessage = buildSystemMessage(mcpTools);

  const openaiMessages: any[] = [
    ...(toolSystemMessage
      ? [{ role: 'system', content: toolSystemMessage }]
      : []),
    ...messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  const texts: string[] = [];
  const toolCalls: MCPToolCall[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const requestBody: any = {
        model: config.model,
        messages: openaiMessages,
      };

      // Add tools if available
      if (mcpTools.length > 0) {
        requestBody.tools = convertMCPToolsToOpenAI(mcpTools);
        requestBody.tool_choice = 'auto';
      }

      const data = await postJSON(
        `${baseUrl}/chat/completions`,
        { Authorization: `Bearer ${apiKey}` },
        requestBody,
        'OpenAI',
      );
      const message = data?.choices?.[0]?.message;

      if (!message) {
        throw new Error('OpenAI returned no choices');
      }

      const text = message.content?.toString().trim();
      if (text) texts.push(text);

      const requested = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (requested.length === 0) {
        return finishReply(text ? texts : [...texts, formatToolResults(toolCalls)], toolCalls, 'OpenAI');
      }

      // Every tool_call id needs a matching tool message, failed or not.
      openaiMessages.push(message);
      for (const toolCall of requested) {
        const executed = await executeMCPToolCall(
          mcpTools,
          toolCall.function?.name || '',
          toolCall.function?.arguments,
          toolCall.id,
        );
        toolCalls.push(executed);
        openaiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResultText(executed),
        });
      }
    }

    return toolRoundsExhausted(texts, toolCalls, 'OpenAI');
  } catch (error) {
    return interruptedReply(error, texts, toolCalls, 'OpenAI');
  }
};


/**
 * Get all available MCP tools from connected servers
 */
const getAllMCPTools = (): RoutedMCPTool[] => {
  // Bind each advertised name to its server for the whole turn. Common names
  // such as read/write must never silently route to the first connected PLC.
  return mcpClientManager.getServers().flatMap((server, serverIndex) =>
    server.status === 'connected' ? (server.tools || []).map((tool, toolIndex) => ({
      ...tool,
      name: `mcp_${serverIndex}_${toolIndex}_${tool.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}`,
      description: `Server: ${server.name}. ${tool.description || tool.name}`,
      originalName: tool.name,
      serverId: server.id,
      serverName: server.name,
    })) : [],
  );
};

const callGemini = async (
  messages: ChatMessage[],
  config: CloudLLMConfig,
  mcpTools: RoutedMCPTool[] = [],
): Promise<LLMReply> => {
  const toolSystemMessage = buildSystemMessage(mcpTools);
  const basePrompt = buildPromptFromMessages(messages);
  const prompt = toolSystemMessage
    ? `${toolSystemMessage}\n\n${basePrompt}`
    : basePrompt;
  const apiKey = getCloudApiKey(config);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents: any[] = [
    {
      role: 'user',
      parts: [{ text: prompt }],
    },
  ];
  const texts: string[] = [];
  const toolCalls: MCPToolCall[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const requestBody: any = { contents };

      if (mcpTools.length > 0) {
        requestBody.tools = convertMCPToolsToGemini(mcpTools);
        requestBody.toolConfig = {
          functionCallingConfig: {
            mode: 'AUTO',
          },
        };
      }

      const data = await postJSON(url, {}, requestBody, 'Gemini');
      const modelContent = data?.candidates?.[0]?.content;
      const responseParts: any[] = modelContent?.parts || [];

      const text = responseParts
        .map((part) => part?.text)
        .filter(Boolean)
        .join(' ')
        .trim();
      if (text) texts.push(text);

      const functionCalls = responseParts.filter((part) => part?.functionCall?.name);
      if (functionCalls.length === 0) {
        return finishReply(text ? texts : [...texts, formatToolResults(toolCalls)], toolCalls, 'Gemini');
      }

      // The model's turn goes back exactly as returned, so any thought
      // signatures on its parts survive into the next request.
      contents.push(modelContent);
      const functionResponses = [];
      for (const part of functionCalls) {
        const { name, args, id } = part.functionCall;
        const executed = await executeMCPToolCall(mcpTools, name, args, id);
        toolCalls.push(executed);
        const resultText = toolResultText(executed);
        functionResponses.push({
          functionResponse: {
            name,
            ...(id ? { id } : {}),
            response: isToolError(executed) ? { error: resultText } : { result: resultText },
          },
        });
      }
      contents.push({ role: 'user', parts: functionResponses });
    }

    return toolRoundsExhausted(texts, toolCalls, 'Gemini');
  } catch (error) {
    return interruptedReply(error, texts, toolCalls, 'Gemini');
  }
};

/**
 * Content to send back as the assistant turn. After a mid-output server-side
 * fallback, the declined model's thinking and tool_use blocks before the last
 * `fallback` marker must not be echoed; everything after it echoes as is.
 */
const echoableAnthropicContent = (content: any[]): any[] => {
  const boundary = content.map((block) => block?.type).lastIndexOf('fallback');
  if (boundary < 0) return content;
  return content.filter(
    (block, index) =>
      index > boundary ||
      !['thinking', 'redacted_thinking', 'connector_text', 'tool_use'].includes(block?.type),
  );
};

const callAnthropic = async (
  messages: ChatMessage[],
  config: CloudLLMConfig,
  mcpTools: RoutedMCPTool[] = [],
): Promise<LLMReply> => {
  const apiKey = getCloudApiKey(config);
  const toolSystemMessage = buildSystemMessage(mcpTools);
  const systemMessages = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content);
  const systemText = [toolSystemMessage, ...systemMessages]
    .filter(Boolean)
    .join('\n\n');
  const conversation: any[] = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: [
        {
          type: 'text',
          text: message.content,
        },
      ],
    }));
  const useServerFallback = ANTHROPIC_SERVER_FALLBACK_MODELS.has(config.model);
  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // This page calls the API straight from the browser with the operator's
    // own key; without this header the API refuses the cross-origin request.
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(useServerFallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
  };

  const texts: string[] = [];
  const toolCalls: MCPToolCall[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const data = await postJSON(
        'https://api.anthropic.com/v1/messages',
        headers,
        {
          model: config.model,
          max_tokens: 16000,
          system: systemText || undefined,
          messages: conversation,
          tools: mcpTools.length > 0 ? convertMCPToolsToAnthropic(mcpTools) : undefined,
          ...(useServerFallback ? { fallbacks: 'default' } : {}),
        },
        'Anthropic',
      );

      if (data?.stop_reason === 'refusal') {
        const category = data?.stop_details?.category;
        throw new Error(`Claude declined this request${category ? ` (${category})` : ''}.`);
      }

      const contentBlocks = echoableAnthropicContent(data?.content || []);
      const text = contentBlocks
        .filter((block: any) => block?.type === 'text')
        .map((block: any) => block?.text)
        .filter(Boolean)
        .join(' ')
        .trim();
      if (text) texts.push(text);

      const toolUses = contentBlocks.filter(
        (block: any) => block?.type === 'tool_use' && block?.name,
      );
      if (data?.stop_reason !== 'tool_use' || toolUses.length === 0) {
        return finishReply(text ? texts : [...texts, formatToolResults(toolCalls)], toolCalls, 'Anthropic');
      }

      // The assistant turn goes back whole (thinking blocks included), and every
      // tool_use gets its tool_result in one user message.
      conversation.push({ role: 'assistant', content: contentBlocks });
      const toolResults = [];
      for (const block of toolUses) {
        const executed = await executeMCPToolCall(
          mcpTools,
          block.name,
          block.input,
          block.id,
        );
        toolCalls.push(executed);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: toolResultText(executed),
          ...(isToolError(executed) ? { is_error: true } : {}),
        });
      }
      conversation.push({ role: 'user', content: toolResults });
    }

    return toolRoundsExhausted(texts, toolCalls, 'Anthropic');
  } catch (error) {
    return interruptedReply(error, texts, toolCalls, 'Anthropic');
  }
};

export const callCloudLLM = async (
  messages: ChatMessage[],
  config: CloudLLMConfig,
): Promise<LLMReply> => {
  // Get available MCP tools
  const mcpTools = getAllMCPTools();

  switch (config.provider) {
    case 'openai':
      return callOpenAIChat(messages, config, mcpTools);
    case 'gemini':
      return callGemini(messages, config, mcpTools);
    case 'anthropic':
      return callAnthropic(messages, config, mcpTools);
    default:
      throw new Error(`Unsupported cloud provider: ${config.provider}`);
  }
};

/**
 * Call a local Ollama model. Tool results go back as `tool` messages and the
 * model is asked again, so the reply is its answer rather than the raw JSON
 * the tools returned.
 */
export const callOllama = async (
  messages: ChatMessage[],
  config: OllamaConfig,
): Promise<LLMReply> => {
  const baseUrl = (config.baseUrl || DEFAULT_OLLAMA_URL).replace(
    /\/$/,
    '',
  );
  const mcpTools = getAllMCPTools();
  const toolSystemMessage = buildSystemMessage(mcpTools);

  const ollamaMessages: any[] = [
    ...(toolSystemMessage
      ? [{ role: 'system', content: toolSystemMessage }]
      : []),
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  const texts: string[] = [];
  const toolCalls: MCPToolCall[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const requestBody: any = {
        model: config.model,
        messages: ollamaMessages,
        stream: false,
      };

      if (mcpTools.length > 0) {
        requestBody.tools = convertMCPToolsToOpenAI(mcpTools);
      }

      const data = await postJSON(`${baseUrl}/api/chat`, {}, requestBody, 'Ollama');
      const message = data?.message;

      const text = message?.content?.toString().trim();
      if (text) texts.push(text);

      const requested = (Array.isArray(message?.tool_calls) ? message.tool_calls : [])
        .map((toolCall: any) => ({
          name: toolCall?.function?.name || toolCall?.name || toolCall?.tool?.name,
          args: toolCall?.function?.arguments || toolCall?.arguments,
          id: toolCall?.id,
        }))
        .filter((toolCall: { name?: string }) => Boolean(toolCall.name));

      if (requested.length === 0) {
        return finishReply(text ? texts : [...texts, formatToolResults(toolCalls)], toolCalls, 'Ollama');
      }

      ollamaMessages.push(message);
      for (const toolCall of requested) {
        const executed = await executeMCPToolCall(
          mcpTools,
          toolCall.name,
          toolCall.args,
          toolCall.id,
        );
        toolCalls.push(executed);
        ollamaMessages.push({
          role: 'tool',
          tool_name: toolCall.name,
          content: toolResultText(executed),
        });
      }
    }

    return toolRoundsExhausted(texts, toolCalls, 'Ollama');
  } catch (error) {
    return interruptedReply(error, texts, toolCalls, 'Ollama');
  }
};
