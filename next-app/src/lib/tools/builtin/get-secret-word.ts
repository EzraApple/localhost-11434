import type { ToolFunction } from '../types';

/**
 * Test tool that returns a secret word
 * Used to validate tool calling functionality
 */
export const getSecretWordTool: ToolFunction = {
  name: 'get_secret_word',
  schema: {
    name: 'get_secret_word',
    description: 'Returns a secret word for testing tool calling functionality. No parameters required.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  execute: async (): Promise<{ word: string }> => {
    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      word: 'elephant'
    };
  }
};
