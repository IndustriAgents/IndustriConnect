import { useState, useEffect } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import IndustrialUI from './components/IndustrialUI';
import MCPServerConfigPanel from './components/MCPServerConfig';
import ModelSettings from './components/ModelSettings';
import {
  ChatMessage,
  ChatSession,
  ChatBackend,
  CloudLLMConfig,
  OllamaConfig,
} from './types';
import { MCPServer, MCPServersConfig } from './types/mcp-types';
import {
  loadSessions,
  saveSessions,
  loadChatBackend,
  saveChatBackend,
  loadCloudLLMConfig,
  saveCloudLLMConfig,
  loadOllamaConfig,
  saveOllamaConfig,
} from './utils/storage';
import {
  loadMCPServersConfig,
  saveMCPServersConfig,
  configToServers,
} from './utils/mcp-storage';
import { mcpClientManager } from './utils/mcp-client';
import { getTheme, setTheme } from './utils/theme';
import { format } from 'date-fns';
import {
  CLOUD_PROVIDER_LABELS,
  callCloudLLM,
  callOllama,
  isChatBackendReady,
} from './utils/llm';

function AppContent() {
  // Saved settings are read as the initial state, not in a mount effect. The
  // save effects below run on mount too; reading in an effect let them write
  // the defaults back first, and under StrictMode's double mount the second
  // read then found those defaults instead of what the operator had chosen.
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatBackend, setChatBackend] = useState<ChatBackend>(loadChatBackend);
  const [cloudLLMConfig, setCloudLLMConfig] = useState<CloudLLMConfig | null>(
    loadCloudLLMConfig,
  );
  const [ollamaConfig, setOllamaConfig] = useState<OllamaConfig | null>(
    loadOllamaConfig,
  );

  // MCP state
  const [mcpConfig, setMcpConfig] = useState<MCPServersConfig>({ mcpServers: {} });
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [showMCPConfig, setShowMCPConfig] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false);

  useEffect(() => {
    const loadedMCPConfig = loadMCPServersConfig();

    // Load MCP configuration
    setMcpConfig(loadedMCPConfig);
    const servers = configToServers(loadedMCPConfig);
    servers.forEach(server => {
      mcpClientManager.addServer(server);
    });
    setMcpServers(servers);

    // Initialize theme
    const currentTheme = getTheme();
    setTheme(currentTheme);

    // Listen for MCP connection changes
    const unsubscribe = mcpClientManager.onConnectionChange((updatedServers) => {
      setMcpServers(updatedServers);
    });

    return () => unsubscribe();
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      saveSessions(sessions);
    }
  }, [sessions]);

  useEffect(() => {
    saveChatBackend(chatBackend);
  }, [chatBackend]);

  useEffect(() => {
    saveCloudLLMConfig(cloudLLMConfig);
  }, [cloudLLMConfig]);

  useEffect(() => {
    saveOllamaConfig(ollamaConfig);
  }, [ollamaConfig]);

  // MCP Server handlers
  const handleMCPConnect = async (serverId: string) => {
    try {
      await mcpClientManager.connectToServer(serverId);
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
    }
  };

  const handleMCPDisconnect = async (serverId: string) => {
    try {
      await mcpClientManager.disconnectFromServer(serverId);
    } catch (error) {
      console.error('Failed to disconnect from MCP server:', error);
    }
  };

  const handleMCPConfigChange = (newConfig: MCPServersConfig) => {
    setMcpConfig(newConfig);
    saveMCPServersConfig(newConfig);

    // Update MCP client manager with new configuration
    const servers = configToServers(newConfig);

    // Remove old servers
    mcpClientManager.getServers().forEach(server => {
      if (!servers.find(s => s.id === server.id)) {
        mcpClientManager.removeServer(server.id);
      }
    });

    // Add/update servers
    servers.forEach(server => {
      mcpClientManager.addServer(server);
    });

    setMcpServers(mcpClientManager.getServers());
  };

  const handleSendMessage = async (content: string) => {
    const now = Date.now();
    const userMessage: ChatMessage = {
      id: `msg-${now}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const allMessages = [...messages, userMessage];

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Update session activity
    if (selectedSessionId) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === selectedSessionId
            ? { ...s, lastActivity: new Date() }
            : s,
        ),
      );
    }

    try {
      let assistantResponse: { content: string; toolCalls?: any[]; error?: boolean } | null = null;

      if (chatBackend === 'cloud-llm' && cloudLLMConfig) {
        assistantResponse = await callCloudLLM(allMessages, cloudLLMConfig);
      } else if (chatBackend === 'ollama' && ollamaConfig) {
        assistantResponse = await callOllama(allMessages, ollamaConfig);
      } else {
        throw new Error('No model selected. Choose one with the model button in the top bar.');
      }

      if (!assistantResponse || !assistantResponse.content) {
        throw new Error('Model returned an empty response');
      }

      const response: ChatMessage = {
        id: `msg-${now + 1}`,
        role: 'assistant',
        content: assistantResponse.content,
        timestamp: new Date(),
        toolCalls: assistantResponse.toolCalls,
        error: assistantResponse.error,
      };

      setMessages((prev) => [...prev, response]);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error while calling the chat backend';

      const response: ChatMessage = {
        id: `msg-${now + 1}`,
        role: 'assistant',
        content: `Error from chat backend: ${errorMessage}`,
        timestamp: new Date(),
        error: true,
      };

      setMessages((prev) => [...prev, response]);
    } finally {
      setIsLoading(false);
    }

    // Create new session if none selected
    if (!selectedSessionId) {
      const newSession: ChatSession = {
        id: `session-${now}`,
        name: `Chat ${format(new Date(), 'MMM d, HH:mm')}`,
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      setSessions((prev) => [newSession, ...prev]);
      setSelectedSessionId(newSession.id);
    }
  };

  const isModelReady = isChatBackendReady(chatBackend, cloudLLMConfig, ollamaConfig);
  let modelLabel: string | null = null;
  if (chatBackend === 'ollama' && ollamaConfig?.model) {
    modelLabel = `Ollama · ${ollamaConfig.model}`;
  } else if (chatBackend === 'cloud-llm' && cloudLLMConfig?.model) {
    modelLabel = `${CLOUD_PROVIDER_LABELS[cloudLLMConfig.provider]} · ${cloudLLMConfig.model}`;
  }

  return (
    <>
      <IndustrialUI
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        mcpServers={mcpServers}
        onMCPConnect={handleMCPConnect}
        onMCPDisconnect={handleMCPDisconnect}
        onOpenSettings={() => setShowMCPConfig(true)}
        modelLabel={modelLabel}
        isModelReady={isModelReady}
        onOpenModelSettings={() => setShowModelSettings(true)}
      />
      {showMCPConfig && (
        <MCPServerConfigPanel
          config={mcpConfig}
          onConfigChange={handleMCPConfigChange}
          onClose={() => setShowMCPConfig(false)}
        />
      )}
      {showModelSettings && (
        <ModelSettings
          chatBackend={chatBackend}
          cloudLLMConfig={cloudLLMConfig}
          ollamaConfig={ollamaConfig}
          onApply={(backend, cloud, ollama) => {
            setChatBackend(backend);
            setCloudLLMConfig(cloud);
            setOllamaConfig(ollama);
            setShowModelSettings(false);
          }}
          onClose={() => setShowModelSettings(false)}
        />
      )}
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
