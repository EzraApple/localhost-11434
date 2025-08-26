import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { db } from "~/server/db";
import type { ToolSchema } from "~/lib/tools/types";

export type ConnectionStatus = 'connected' | 'connecting' | 'error' | 'disconnected';

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
}

class ServerMcpManager {
  private clients = new Map<string, Client>();
  private transports = new Map<string, any>();
  private connectionStatus = new Map<string, ConnectionStatus>();
  private serverConfigs = new Map<string, McpServerConfig>();
  private healthCheckInterval?: NodeJS.Timeout;
  
  async refreshFromDatabase(): Promise<void> {
    try {
      // Load enabled MCP servers from database
      const servers = await db.mcpServer.findMany({ 
        where: { enabled: true },
        orderBy: { name: 'asc' }
      });
      
      console.log(`[MCP] Loading ${servers.length} enabled servers from database`);
      
      // Disconnect servers that are no longer in the database or disabled
      for (const [serverId] of this.clients.entries()) {
        if (!servers.find(s => s.id === serverId)) {
          console.log(`[MCP] Server ${serverId} no longer enabled, disconnecting`);
          await this.disconnectServer(serverId);
        }
      }
      
      // Connect to new/updated servers
      for (const server of servers) {
        const config: McpServerConfig = {
          id: server.id,
          name: server.name,
          command: server.command,
          args: server.args as string[],
          enabled: server.enabled
        };
        
        // If server is not connected, connect it
        if (!this.clients.has(server.id)) {
          console.log(`[MCP] Connecting to new server: ${server.name}`);
          try {
            await this.connectServer(config);
          } catch (error) {
            console.error(`[MCP] Failed to connect to ${server.name}:`, error);
          }
        } else {
          // Update the config in case it changed
          this.serverConfigs.set(server.id, config);
        }
      }
      
      console.log(`[MCP] Refresh complete. Connected servers: ${this.clients.size}`);
    } catch (error) {
      console.error('[MCP] Failed to refresh from database:', error);
    }
  }
  
  async connectServer(config: McpServerConfig): Promise<void> {
    console.log(`[MCP] Connecting to server: ${config.name} (${config.command} ${config.args.join(' ')})`);
    this.connectionStatus.set(config.id, 'connecting');
    
    try {
      // Create stdio transport for package manager command
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args
      });
      
      // Add error handlers to detect process failures
      this.setupTransportErrorHandlers(transport, config);
      
      const client = new Client({
        name: "localhost-11434-server",
        version: "1.0.0"
      });
      
      // Connect to the MCP server
      await client.connect(transport);
      
      // Store the connection
      this.clients.set(config.id, client);
      this.transports.set(config.id, transport);
      this.serverConfigs.set(config.id, config);
      this.connectionStatus.set(config.id, 'connected');
      
      console.log(`✅ [MCP] Connected to server: ${config.name}`);
      
      // Log available tools for debugging
      try {
        const toolsResponse = await client.listTools();
        const toolNames = toolsResponse.tools.map(t => t.name);
        console.log(`[MCP] Server ${config.name} provides tools: [${toolNames.join(', ')}]`);
      } catch (toolsError) {
        console.warn(`[MCP] Could not list tools for ${config.name}:`, toolsError);
      }
      
    } catch (error) {
      this.connectionStatus.set(config.id, 'error');
      console.error(`❌ [MCP] Failed to connect to ${config.name}:`, error);
      throw error;
    }
  }

  private setupTransportErrorHandlers(transport: any, config: McpServerConfig): void {
    try {
      // Access the underlying process if available
      const process = (transport as any).process;
      
      if (process) {
        // Handle process exit
        process.on('exit', (code: number, signal: string) => {
          console.warn(`[MCP] Server process exited: ${config.name} (code: ${code}, signal: ${signal})`);
          this.connectionStatus.set(config.id, 'disconnected');
          this.cleanupServer(config.id);
        });

        // Handle process errors
        process.on('error', (error: Error) => {
          console.error(`[MCP] Server process error: ${config.name}:`, error);
          this.connectionStatus.set(config.id, 'error');
          this.cleanupServer(config.id);
        });

        // Handle stdio errors
        if (process.stdin) {
          process.stdin.on('error', (error: Error) => {
            console.warn(`[MCP] Server stdin error: ${config.name}:`, error);
            this.connectionStatus.set(config.id, 'error');
            this.cleanupServer(config.id);
          });
        }

        if (process.stdout) {
          process.stdout.on('error', (error: Error) => {
            console.warn(`[MCP] Server stdout error: ${config.name}:`, error);
            this.connectionStatus.set(config.id, 'error');
            this.cleanupServer(config.id);
          });
        }

        if (process.stderr) {
          process.stderr.on('error', (error: Error) => {
            console.warn(`[MCP] Server stderr error: ${config.name}:`, error);
            // Don't mark as error for stderr issues, just log
          });
        }
      }

      // Handle transport-level errors if the transport has error events
      if (typeof transport.on === 'function') {
        transport.on('error', (error: Error) => {
          console.error(`[MCP] Transport error: ${config.name}:`, error);
          this.connectionStatus.set(config.id, 'error');
          this.cleanupServer(config.id);
        });
      }
    } catch (error) {
      console.warn(`[MCP] Could not setup error handlers for ${config.name}:`, error);
    }
  }

  private async cleanupServer(serverId: string): Promise<void> {
    // Clean up without trying to close already-dead connections
    const config = this.serverConfigs.get(serverId);
    
    this.clients.delete(serverId);
    this.transports.delete(serverId);
    this.serverConfigs.delete(serverId);
    
    console.log(`[MCP] Cleaned up dead server: ${config?.name || serverId}`);
  }

  // Start periodic health checks
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      for (const [serverId, client] of this.clients.entries()) {
        const status = this.connectionStatus.get(serverId);
        const config = this.serverConfigs.get(serverId);
        
        if (status === 'connected' && client && config) {
          try {
            // Quick health check - just ping the server
            await client.listTools();
          } catch (error) {
            console.warn(`[MCP] Health check failed for ${config.name}, cleaning up:`, error);
            this.connectionStatus.set(serverId, 'error');
            this.cleanupServer(serverId);
          }
        }
      }
    }, 30000);
  }

  // Stop health checks (for cleanup)
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }
  
  async disconnectServer(serverId: string): Promise<void> {
    const config = this.serverConfigs.get(serverId);
    const client = this.clients.get(serverId);
    const transport = this.transports.get(serverId);
    
    if (client || transport) {
      try {
        // Cleanup connection
        if (client && typeof client.close === 'function') {
          await client.close();
        }
        if (transport && typeof transport.close === 'function') {
          await transport.close();
        }
      } catch (error) {
        console.warn(`[MCP] Warning during disconnect of ${config?.name || serverId}:`, error);
      }
      
      this.clients.delete(serverId);
      this.transports.delete(serverId);
      this.serverConfigs.delete(serverId);
      this.connectionStatus.set(serverId, 'disconnected');
      
      console.log(`[MCP] Disconnected server: ${config?.name || serverId}`);
    }
  }
  
  // Get all available tools from connected servers
  async getAvailableTools(): Promise<ToolSchema[]> {
    const allTools: ToolSchema[] = [];
    
    for (const [serverId, client] of this.clients.entries()) {
      const status = this.connectionStatus.get(serverId);
      if (status === 'connected') {
        try {
          const response = await client.listTools();
          const serverName = this.serverConfigs.get(serverId)?.name || 'Unknown';
          
          const serverTools: ToolSchema[] = response.tools.map(tool => ({
            name: tool.name,
            description: tool.description || `Tool from ${serverName}`,
            parameters: tool.inputSchema || { type: 'object', properties: {}, required: [] }
          }));
          
          allTools.push(...serverTools);
          
        } catch (error) {
          console.error(`[MCP] Failed to list tools from server ${serverId}:`, error);
          this.connectionStatus.set(serverId, 'error');
          // Clean up the dead connection
          this.cleanupServer(serverId);
        }
      }
    }
    
    console.log(`[MCP] Total available tools: ${allTools.length}`);
    return allTools;
  }

  // Get tools for a specific server
  async getServerTools(serverId: string): Promise<ToolSchema[]> {
    const client = this.clients.get(serverId);
    const status = this.connectionStatus.get(serverId);
    
    if (!client || status !== 'connected') {
      return [];
    }
    
    try {
      const response = await client.listTools();
      const serverName = this.serverConfigs.get(serverId)?.name || 'Unknown';
      
      return response.tools.map(tool => ({
        name: tool.name,
        description: tool.description || `Tool from ${serverName}`,
        parameters: tool.inputSchema || { type: 'object', properties: {}, required: [] }
      }));
      
    } catch (error) {
      console.error(`[MCP] Failed to list tools from server ${serverId}:`, error);
      this.connectionStatus.set(serverId, 'error');
      // Clean up the dead connection
      this.cleanupServer(serverId);
      return [];
    }
  }
  
  // Execute tool call (used by chat API)
  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    console.log(`[MCP] Executing tool: ${toolName} with args:`, args);
    
    for (const [serverId, client] of this.clients.entries()) {
      const status = this.connectionStatus.get(serverId);
      if (status === 'connected') {
        try {
          // Check if this server has the requested tool
          const tools = await client.listTools();
          const tool = tools.tools.find(t => t.name === toolName);
          
          if (tool) {
            const serverName = this.serverConfigs.get(serverId)?.name || 'Unknown';
            console.log(`[MCP] Found tool ${toolName} on server: ${serverName}`);
            
            const result = await client.callTool({
              name: toolName,
              arguments: args
            });
            
            console.log(`[MCP] Tool ${toolName} executed successfully`);
            return result.content;
          }
        } catch (error) {
          const serverName = this.serverConfigs.get(serverId)?.name || 'Unknown';
          console.error(`[MCP] Tool execution failed on server ${serverName}:`, error);
          this.connectionStatus.set(serverId, 'error');
          // Clean up the dead connection
          this.cleanupServer(serverId);
        }
      }
    }
    
    throw new Error(`Tool "${toolName}" not found on any connected MCP server`);
  }
  
  // Get connection status for all servers (for settings UI)
  getServerStatuses(): Record<string, ConnectionStatus> {
    return Object.fromEntries(this.connectionStatus.entries());
  }
  
  // Get server configuration
  getServerConfig(serverId: string): McpServerConfig | undefined {
    return this.serverConfigs.get(serverId);
  }
  
  // Get all connected server info
  getConnectedServers(): Array<{ id: string; name: string; toolCount: number }> {
    const connectedServers: Array<{ id: string; name: string; toolCount: number }> = [];
    
    for (const [serverId, client] of this.clients.entries()) {
      const status = this.connectionStatus.get(serverId);
      const config = this.serverConfigs.get(serverId);
      
      if (status === 'connected' && config) {
        // We could cache tool counts, but for now just report that it's connected
        connectedServers.push({
          id: serverId,
          name: config.name,
          toolCount: 0 // Will be populated when tools are listed
        });
      }
    }
    
    return connectedServers;
  }
  
  // Cleanup all connections
  async cleanup(): Promise<void> {
    console.log('[MCP] Cleaning up all connections...');
    const serverIds = Array.from(this.clients.keys());
    
    for (const serverId of serverIds) {
      await this.disconnectServer(serverId);
    }
    
    console.log('[MCP] Cleanup complete');
  }
}

// Singleton instance for server-side use
export const serverMcpManager = new ServerMcpManager();

// Initialize on startup
serverMcpManager.refreshFromDatabase().then(() => {
  // Start health monitoring after initial setup
  (serverMcpManager as any).startHealthCheck();
}).catch(error => {
  console.error('[MCP] Failed to initialize server MCP manager:', error);
});
