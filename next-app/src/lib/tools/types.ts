/**
 * Tool calling system types
 */

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolFunction {
  name: string;
  schema: ToolSchema;
  execute: (args: Record<string, any>) => Promise<any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  phase: 'reasoning' | 'response';
  result?: any;
  error?: string;
}

export interface ToolResult {
  id: string;
  name: string;
  result?: any;
  error?: string;
  phase: 'reasoning' | 'response';
}
