import type { ToolFunction } from '../types';

export const getSecondSecretWordTool: ToolFunction = {
  name: 'get_second_secret_word',
  schema: {
    name: 'get_second_secret_word',
    description: 'Returns a second secret word for testing multiple tool calling functionality',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  execute: async () => {
    return { word: 'giraffe' };
  }
};
