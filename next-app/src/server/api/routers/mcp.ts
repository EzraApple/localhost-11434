import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { serverMcpManager } from "~/lib/mcp/server-client-manager";

const createMcpServerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  command: z.string().min(1, "Command is required"),
  args: z.array(z.string()).min(1, "At least one argument is required")
});

const updateMcpServerSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional()
});

export const mcpRouter = createTRPCRouter({
  // List all MCP servers
  listServers: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db.mcpServer.findMany({
      orderBy: { name: 'asc' }
    });
  }),
  
  // Create new MCP server
  createServer: publicProcedure
    .input(createMcpServerSchema)
    .mutation(async ({ ctx, input }) => {
      const server = await ctx.db.mcpServer.create({
        data: input
      });
      
      // Refresh server connections to include the new server
      await serverMcpManager.refreshFromDatabase();
      
      return server;
    }),
    
  // Update MCP server
  updateServer: publicProcedure
    .input(updateMcpServerSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const server = await ctx.db.mcpServer.update({
        where: { id },
        data
      });
      
      // Refresh connections after update
      await serverMcpManager.refreshFromDatabase();
      
      return server;
    }),
    
  // Delete MCP server
  deleteServer: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Disconnect the server first
      await serverMcpManager.disconnectServer(input.id);
      
      // Then delete from database
      await ctx.db.mcpServer.delete({
        where: { id: input.id }
      });
      
      return { success: true };
    }),
    
  // Toggle server enabled state
  toggleServer: publicProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const server = await ctx.db.mcpServer.update({
        where: { id: input.id },
        data: { enabled: input.enabled }
      });
      
      // Refresh connections to apply the enabled/disabled state
      await serverMcpManager.refreshFromDatabase();
      
      return server;
    }),
    
  // Real-time status information
  getServerStatuses: publicProcedure.query(async () => {
    return serverMcpManager.getServerStatuses();
  }),
  
  // Get connected servers info
  getConnectedServers: publicProcedure.query(async () => {
    return serverMcpManager.getConnectedServers();
  }),

  // Get tools for a specific server
  getServerTools: publicProcedure
    .input(z.object({ serverId: z.string() }))
    .query(async ({ input }) => {
      return await serverMcpManager.getServerTools(input.serverId);
    }),
  
  // Test connection without persisting
  testConnection: publicProcedure
    .input(z.object({
      command: z.string(),
      args: z.array(z.string())
    }))
    .mutation(async ({ input }) => {
      try {
        if (!input.command || input.args.length === 0) {
          throw new Error('Invalid command or arguments');
        }
        
        // Basic validation - ensure command is not empty and seems valid
        if (input.command.trim().length === 0) {
          throw new Error('Command cannot be empty');
        }
        
        // Create a temporary test configuration
        const testConfig = {
          id: 'test-' + Date.now(),
          name: 'Test Connection',
          command: input.command,
          args: input.args,
          enabled: true
        };
        
        // Try to connect temporarily
        await serverMcpManager.connectServer(testConfig);
        
        // If successful, disconnect immediately
        await serverMcpManager.disconnectServer(testConfig.id);
        
        return { success: true, message: 'Connection successful' };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Connection test failed' 
        };
      }
    })
});
