/**
 * Built-in tools for the application
 */

export { getSecretWordTool } from './get-secret-word';
export { getSecondSecretWordTool } from './get-second-secret-word';

import { getSecretWordTool } from './get-secret-word';
import { getSecondSecretWordTool } from './get-second-secret-word';
import { toolRegistry } from '../registry';

/**
 * Register all built-in tools
 */
export function registerBuiltinTools(): void {
  toolRegistry.register(getSecretWordTool);
  toolRegistry.register(getSecondSecretWordTool);
}

/**
 * List of all built-in tools
 */
export const builtinTools = [
  getSecretWordTool,
  getSecondSecretWordTool,
];
