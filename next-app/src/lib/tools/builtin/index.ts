/**
 * Built-in tools for the application
 */

export { calculateTool } from './calculate';
export { getTimeTool } from './get-time';

import { calculateTool } from './calculate';
import { getTimeTool } from './get-time';
import { toolRegistry } from '../registry';

/**
 * Register all built-in tools
 */
export function registerBuiltinTools(): void {
  toolRegistry.register(calculateTool);
  toolRegistry.register(getTimeTool);
}

/**
 * List of all built-in tools
 */
export const builtinTools = [
  calculateTool,
  getTimeTool,
];
