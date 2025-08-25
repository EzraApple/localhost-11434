import type { ToolFunction } from '../types';

/**
 * Time tool that returns current date/time information
 * Can format time in different timezones and formats
 */
export const getTimeTool: ToolFunction = {
  name: 'get_time',
  schema: {
    name: 'get_time',
    description: 'Returns the current date and time information. Can optionally format for specific timezones or return in different formats.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Optional timezone (e.g., "UTC", "America/New_York", "Europe/London", "Asia/Tokyo"). Defaults to local timezone.',
          default: 'local'
        },
        format: {
          type: 'string',
          description: 'Optional format type: "iso" (ISO 8601), "locale" (human readable), "unix" (timestamp), "detailed" (comprehensive info). Defaults to "detailed".',
          enum: ['iso', 'locale', 'unix', 'detailed'],
          default: 'detailed'
        }
      },
      required: []
    }
  },
  execute: async (args: Record<string, any> = {}): Promise<{
    timestamp: number;
    iso: string;
    locale: string;
    timezone: string;
    utc: string;
    formatted?: any;
  }> => {
    try {
      const { timezone = 'local', format = 'detailed' } = args as { timezone?: string; format?: string };
      const now = new Date();
      
      // Get timezone info
      const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const targetTimezone = timezone === 'local' ? localTimezone : timezone;
      
      // Base time information
      const result = {
        timestamp: now.getTime(),
        iso: now.toISOString(),
        locale: now.toLocaleString(),
        timezone: localTimezone,
        utc: now.toUTCString()
      };

      // Handle different output formats
      if (format === 'iso') {
        return {
          ...result,
          formatted: targetTimezone !== localTimezone 
            ? new Date().toLocaleString('sv-SE', { timeZone: targetTimezone }).replace(' ', 'T') + 'Z'
            : result.iso
        };
      }

      if (format === 'unix') {
        return {
          ...result,
          formatted: Math.floor(now.getTime() / 1000)
        };
      }

      if (format === 'locale') {
        const localeOptions: Intl.DateTimeFormatOptions = {
          timeZone: targetTimezone !== 'local' ? targetTimezone : undefined,
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'long'
        };
        
        return {
          ...result,
          formatted: now.toLocaleString('en-US', localeOptions)
        };
      }

      // Default: detailed format
      const detailedInfo = {
        local: {
          timezone: localTimezone,
          time: now.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
          }),
          date: now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          time24: now.toLocaleTimeString('en-GB', { hour12: false })
        },
        utc: {
          timezone: 'UTC',
          time: now.toLocaleString('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'long',
            day: 'numeric', 
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
          }),
          iso: result.iso
        },
        unix: {
          timestamp: result.timestamp,
          seconds: Math.floor(result.timestamp / 1000)
        }
      };

      // Add requested timezone if different from local
      if (targetTimezone !== 'local' && targetTimezone !== localTimezone) {
        try {
          (detailedInfo as any).requested = {
            timezone: targetTimezone,
            time: now.toLocaleString('en-US', {
              timeZone: targetTimezone,
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit', 
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short'
            })
          };
        } catch (error) {
          (detailedInfo as any).requested = {
            timezone: targetTimezone,
            error: 'Invalid timezone specified'
          };
        }
      }

      return {
        ...result,
        formatted: detailedInfo
      };

    } catch (error) {
      // Fallback in case of any errors
      const now = new Date();
      return {
        timestamp: now.getTime(),
        iso: now.toISOString(),
        locale: now.toLocaleString(),
        timezone: 'unknown',
        utc: now.toUTCString(),
        formatted: {
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      };
    }
  }
};
