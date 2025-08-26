import type { ToolFunction, ToolSchema } from './types';
import { serverMcpManager } from '~/lib/mcp/server-client-manager';

/**
 * Tool Registry for managing available tools
 */
export class ToolRegistry {
  private tools = new Map<string, ToolFunction>();

  /**
   * Register a new tool
   */
  register(tool: ToolFunction): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a specific tool by name
   */
  get(name: string): ToolFunction | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all available tool schemas for Ollama (including MCP tools)
   */
  async list(): Promise<ToolSchema[]> {
    // Start with built-in tools (always available)
    const builtinTools = Array.from(this.tools.values()).map(tool => tool.schema);
    
    try {
      // Add MCP tools from connected servers
      const mcpTools = await serverMcpManager.getAvailableTools();
      console.log(`[ToolRegistry] Available tools: ${builtinTools.length} built-in + ${mcpTools.length} MCP`);
      return [...builtinTools, ...mcpTools];
    } catch (error) {
      console.warn('[ToolRegistry] Failed to get MCP tools, using built-in only:', error);
      return builtinTools;
    }
  }
  
  /**
   * Get all available tool schemas for Ollama (sync version for backward compatibility)
   */
  listSync(): ToolSchema[] {
    return Array.from(this.tools.values()).map(tool => tool.schema);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Remove a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get all tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a tool by name with arguments (tries built-in first, then MCP)
   */
  async execute(name: string, args: Record<string, any>): Promise<any> {
    // Try built-in tools first (fastest path)
    const builtinTool = this.tools.get(name);
    if (builtinTool) {
      try {
        console.log(`[ToolRegistry] Executing built-in tool: ${name}`);
        return await builtinTool.execute(args);
      } catch (error) {
        throw new Error(`Built-in tool "${name}" execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Try MCP tools if built-in not found
    try {
      console.log(`[ToolRegistry] Tool ${name} not found in built-in, trying MCP servers...`);
      return await serverMcpManager.callTool(name, args);
    } catch (mcpError) {
      // If MCP also fails, throw a comprehensive error
      throw new Error(`Tool "${name}" not found in built-in tools or MCP servers`);
    }
  }
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();
