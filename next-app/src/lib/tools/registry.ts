import type { ToolFunction, ToolSchema } from './types';

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
   * Get all available tool schemas for Ollama
   */
  list(): ToolSchema[] {
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
   * Execute a tool by name with arguments
   */
  async execute(name: string, args: Record<string, any>): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }
    
    try {
      return await tool.execute(args);
    } catch (error) {
      throw new Error(`Tool "${name}" execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();
