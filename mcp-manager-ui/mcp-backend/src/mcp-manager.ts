import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServerConfig, MCPTool } from './types.js';
import { normalizeToolResult } from './tool-result.js';

interface MCPServerInstance {
    id: string;
    name: string;
    config: MCPServerConfig;
    client: Client;
    tools: MCPTool[];
    status: 'connecting' | 'connected' | 'error' | 'disconnected';
    error?: string;
}

export class MCPServerManager {
    private servers: Map<string, MCPServerInstance> = new Map();

    /**
     * Spawn and connect to an MCP server
     */
    async spawnServer(
        serverId: string,
        serverName: string,
        config: MCPServerConfig
    ): Promise<{ success: boolean; error?: string; tools?: MCPTool[] }> {
        console.log(`[MCP Manager] Spawning server ${serverName} (${serverId})`);
        console.log(`[MCP Manager] Command: ${config.command} ${config.args.join(' ')}`);

        // StdioClientTransport handles spawning the process
        const transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: { ...process.env, ...config.env } as Record<string, string>, // Merge with current env
            stderr: 'inherit', // Pipe stderr to parent stderr for debugging
        });

        const client = new Client(
            {
                name: 'mcp-backend-client',
                version: '1.0.0',
            },
            {
                capabilities: {},
            }
        );

        const serverInstance: MCPServerInstance = {
            id: serverId,
            name: serverName,
            config,
            client,
            tools: [],
            status: 'connecting',
        };

        // Register on the client, not the transport: Client.connect() wraps the
        // transport callbacks, and replacing them would stop the SDK from
        // rejecting in-flight requests when the server process exits.
        client.onerror = (error) => {
            console.error(`[MCP Manager] Transport error for ${serverName}:`, error);
            serverInstance.error = error instanceof Error ? error.message : String(error);
        };

        client.onclose = () => {
            console.log(`[MCP Manager] Transport closed for ${serverName}`);
            serverInstance.status = 'disconnected';
            if (this.servers.get(serverId) === serverInstance) {
                this.servers.delete(serverId);
            }
        };

        try {
            console.log(`[MCP Manager] Connecting to ${serverName}...`);
            await client.connect(transport);

            console.log(`[MCP Manager] Connected to ${serverName}`);

            // Listing tools also caches their output schemas, which the SDK
            // uses to validate structuredContent on later calls.
            const toolsResponse = await client.listTools();
            const tools: MCPTool[] = toolsResponse.tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                // The SDK types nested properties as plain JSON Schema objects
                inputSchema: tool.inputSchema as MCPTool['inputSchema'],
            }));

            console.log(`[MCP Manager] Found ${tools.length} tools from ${serverName}`);

            if (serverInstance.status === 'disconnected') {
                throw new Error(`Server ${serverName} closed during startup`);
            }

            serverInstance.tools = tools;
            serverInstance.status = 'connected';
            this.servers.set(serverId, serverInstance);

            return { success: true, tools };
        } catch (error) {
            console.error(`[MCP Manager] Failed to spawn server ${serverName}:`, error);
            serverInstance.status = 'error';
            // Stop a process that started but failed initialization or discovery
            await client.close().catch(closeError => {
                console.error(`[MCP Manager] Error closing failed server ${serverName}:`, closeError);
            });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * List tools from a connected server
     */
    async listTools(serverId: string): Promise<MCPTool[]> {
        const server = this.servers.get(serverId);
        if (!server) {
            throw new Error(`Server ${serverId} not found`);
        }

        if (server.status !== 'connected') {
            throw new Error(`Server ${serverId} is not connected`);
        }

        return server.tools;
    }

    /**
     * Call a tool on a connected server
     */
    async callTool(
        serverId: string,
        toolName: string,
        args: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        const server = this.servers.get(serverId);
        if (!server) {
            throw new Error(`Server ${serverId} not found`);
        }

        if (server.status !== 'connected') {
            throw new Error(`Server ${serverId} is not connected`);
        }

        console.log(`[MCP Manager] Calling tool ${toolName} on ${server.name}`);
        console.log(`[MCP Manager] Arguments:`, args);

        try {
            // Rejects if the server exits mid-call or if structuredContent does
            // not match the tool's advertised output schema.
            const result = await server.client.callTool({
                name: toolName,
                arguments: args,
            });

            console.log(`[MCP Manager] Tool result:`, result);
            return normalizeToolResult(result);
        } catch (error) {
            console.error(`[MCP Manager] Tool call failed:`, error);
            throw error;
        }
    }

    /**
     * Disconnect from a server
     */
    async disconnectServer(serverId: string): Promise<void> {
        const server = this.servers.get(serverId);
        if (!server) {
            return; // Already disconnected
        }

        console.log(`[MCP Manager] Disconnecting server ${server.name}`);
        this.servers.delete(serverId);

        try {
            // Closes the transport and terminates the server process
            await server.client.close();
        } catch (error) {
            console.error(`[MCP Manager] Error disconnecting server:`, error);
        }
    }

    /**
     * Get server status
     */
    getServerStatus(serverId: string): string {
        const server = this.servers.get(serverId);
        return server?.status || 'disconnected';
    }

    /**
     * Cleanup all servers
     */
    async cleanup(): Promise<void> {
        console.log('[MCP Manager] Cleaning up all servers');
        const serverIds = Array.from(this.servers.keys());
        for (const serverId of serverIds) {
            await this.disconnectServer(serverId);
        }
    }
}
