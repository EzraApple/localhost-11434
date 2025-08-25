import type { ToolFunction } from '../types';

/**
 * Math evaluator tool that can calculate mathematical expressions
 * Supports basic arithmetic, trigonometry, and common math functions
 */
export const calculateTool: ToolFunction = {
  name: 'calculate',
  schema: {
    name: 'calculate',
    description: 'Evaluates mathematical expressions and returns the result. Supports arithmetic (+, -, *, /, %), powers (^), roots (sqrt), trigonometry (sin, cos, tan), logarithms (log, ln), and constants (pi, e).',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The mathematical expression to evaluate (e.g., "2 + 3 * 4", "sqrt(16)", "sin(pi/2)", "log(100)")'
        }
      },
      required: ['expression']
    }
  },
  execute: async (args: Record<string, any>): Promise<{ result: number | string; expression: string }> => {
    try {
      const { expression } = args as { expression: string };
      
      // Basic security: only allow safe mathematical operations
      const allowedChars = /^[0-9+\-*/().^\s,a-zA-Z]+$/;
      if (!allowedChars.test(expression)) {
        throw new Error('Expression contains invalid characters');
      }

      // Replace common math functions and constants
      let processedExpression = expression
        .replace(/\bpi\b/g, Math.PI.toString())
        .replace(/\be\b/g, Math.E.toString())
        .replace(/\bsqrt\s*\(/g, 'Math.sqrt(')
        .replace(/\bsin\s*\(/g, 'Math.sin(')
        .replace(/\bcos\s*\(/g, 'Math.cos(')
        .replace(/\btan\s*\(/g, 'Math.tan(')
        .replace(/\basin\s*\(/g, 'Math.asin(')
        .replace(/\bacos\s*\(/g, 'Math.acos(')
        .replace(/\batan\s*\(/g, 'Math.atan(')
        .replace(/\batan2\s*\(/g, 'Math.atan2(')
        .replace(/\blog\s*\(/g, 'Math.log10(')
        .replace(/\bln\s*\(/g, 'Math.log(')
        .replace(/\babs\s*\(/g, 'Math.abs(')
        .replace(/\bfloor\s*\(/g, 'Math.floor(')
        .replace(/\bceil\s*\(/g, 'Math.ceil(')
        .replace(/\bround\s*\(/g, 'Math.round(')
        .replace(/\bmin\s*\(/g, 'Math.min(')
        .replace(/\bmax\s*\(/g, 'Math.max(')
        .replace(/\bpow\s*\(/g, 'Math.pow(')
        .replace(/\^/g, '**'); // Replace ^ with ** for exponentiation

      // Additional security: check for dangerous patterns
      const dangerousPatterns = [
        'eval', 'Function', 'constructor', 'prototype', 'window', 'global', 
        'process', 'require', 'import', 'document', '__', 'this'
      ];
      
      for (const pattern of dangerousPatterns) {
        if (processedExpression.includes(pattern)) {
          throw new Error(`Potentially unsafe operation: ${pattern}`);
        }
      }

      // Evaluate the expression using Function constructor (safer than eval)
      const result = new Function('Math', `"use strict"; return (${processedExpression})`)(Math);
      
      if (typeof result !== 'number') {
        throw new Error('Expression did not evaluate to a number');
      }

      if (!isFinite(result)) {
        return {
          result: isNaN(result) ? 'NaN' : (result > 0 ? 'Infinity' : '-Infinity'),
          expression
        };
      }

      // Round to reasonable precision to avoid floating point issues
      const roundedResult = Math.round(result * 1e12) / 1e12;

      return {
        result: roundedResult,
        expression
      };

    } catch (error) {
      return {
        result: `Error: ${error instanceof Error ? error.message : 'Invalid expression'}`,
        expression: (args as { expression: string }).expression || 'unknown'
      };
    }
  }
};
