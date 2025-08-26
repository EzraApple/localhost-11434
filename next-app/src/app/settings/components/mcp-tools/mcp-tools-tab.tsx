'use client'

import { useState } from 'react'
import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { Plus } from 'lucide-react'
import { McpServerCard } from './mcp-server-card'
import { AddMcpServerDialog } from './add-mcp-server-dialog'

export default function McpToolsTab() {
  const [showAddDialog, setShowAddDialog] = useState(false)
  
  const { data: servers, refetch, isLoading } = api.mcp.listServers.useQuery()
  const { data: statuses } = api.mcp.getServerStatuses.useQuery(
    undefined,
    { 
      refetchInterval: 2000, // Poll every 2 seconds for status updates
      retry: false // Don't retry on failure to avoid spam
    }
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-center text-neutral-300">
            Connect to Model Context Protocol (MCP) servers to extend your AI's capabilities with external tools and data sources.
          </p>
        </div>
    
      </div>

      <Separator />

      {/* Server List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="text-sm text-neutral-400">Loading MCP servers...</div>
          </div>
        ) : !servers || servers.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-sm text-neutral-400 mb-4">No MCP servers configured</div>
            <Button
              onClick={() => setShowAddDialog(true)}
              variant="outline"
              className="border-[#113936] text-[#d3e6e2] hover:bg-[#113936]/20"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add your first MCP server
            </Button>
          </div>
        ) : (
          <div className="border border-white/10 rounded-lg bg-black/10 overflow-hidden">
            {servers.map((server, index) => (
              <div key={server.id}>
                <McpServerCard
                  server={{
                    ...server,
                    args: Array.isArray(server.args) ? server.args as string[] : []
                  }}
                  status={statuses?.[server.id] || 'disconnected'}
                  onUpdate={refetch}
                  isFirst={index === 0}
                  isLast={false} // Add button is always last
                />
                {index < servers.length - 1 && (
                  <div className="border-b border-white/10" />
                )}
              </div>
            ))}
            
            {/* Add Server Card */}
            <div 
              onClick={() => setShowAddDialog(true)}
              className="flex items-center justify-between px-4 py-3 border-t border-white/10 hover:bg-black/20 cursor-pointer transition-colors group"
            >
              <div className="flex items-center space-x-3">
                {/* Plus Avatar */}
                <div className="w-8 h-8 rounded-full bg-neutral-600 flex items-center justify-center text-white group-hover:bg-neutral-500">
                  <Plus className="h-4 w-4" />
                </div>

                {/* Add Server Info */}
                <div>
                  <div className="font-medium text-neutral-300 group-hover:text-white">New MCP Server</div>
                  <div className="text-sm text-neutral-500 group-hover:text-neutral-400">
                    Add a Custom MCP Server
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Server Dialog */}
      <AddMcpServerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onServerAdded={refetch}
      />
    </div>
  )
}
