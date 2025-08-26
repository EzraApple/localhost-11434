'use client'

import React, { useState, useMemo } from 'react'
import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { MoreHorizontal, Trash2, TestTube, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import type { ConnectionStatus } from '~/lib/mcp/server-client-manager'

interface McpServerCardProps {
  server: {
    id: string
    name: string
    command: string
    args: string[]
    enabled: boolean
    createdAt: Date
    updatedAt: Date
  }
  status: ConnectionStatus
  onUpdate: () => void
  isFirst?: boolean
  isLast?: boolean
}

export function McpServerCard({ server, status, onUpdate, isFirst = false, isLast = false }: McpServerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [optimisticEnabled, setOptimisticEnabled] = useState(server.enabled)
  
  const toggleServerMutation = api.mcp.toggleServer.useMutation()
  const deleteServerMutation = api.mcp.deleteServer.useMutation()
  const testConnectionMutation = api.mcp.testConnection.useMutation()
  
  // Sync optimistic state with server state when it changes
  React.useEffect(() => {
    setOptimisticEnabled(server.enabled)
  }, [server.enabled])
  
  // Mock tools based on server name - memoized to prevent recreation
  const getMockTools = useMemo(() => (serverName: string) => {
    if (serverName.toLowerCase().includes('gh') || serverName.toLowerCase().includes('github')) {
      return [
        { name: 'search_repos', enabled: true },
        { name: 'get_repo_details', enabled: true },
        { name: 'read_file_content', enabled: true },
        { name: 'get_readme', enabled: true },
        { name: 'get_file_tree', enabled: true },
        { name: 'get_commit_history', enabled: true },
        { name: 'get_languages', enabled: true }
      ]
    }
    if (serverName.toLowerCase().includes('filesystem')) {
      return [
        { name: 'read_file', enabled: true },
        { name: 'write_file', enabled: true },
        { name: 'list_directory', enabled: true },
        { name: 'create_directory', enabled: true }
      ]
    }
    // Default generic tools
    return [
      { name: 'tool_1', enabled: true },
      { name: 'tool_2', enabled: true },
      { name: 'tool_3', enabled: false }
    ]
  }, [])
  
  // Fetch real tools for this server
  const { data: serverTools, isLoading: toolsLoading } = api.mcp.getServerTools.useQuery(
    { serverId: server.id },
    { 
      enabled: optimisticEnabled && status === 'connected',
      refetchInterval: false, // Only fetch once, tools don't change often
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  )

  // Use real tools if available, fallback to mock tools for demonstration
  const tools = useMemo(() => {
    if (serverTools && serverTools.length > 0) {
      return serverTools.map(tool => ({ name: tool.name, enabled: true }))
    }
    return status === 'connected' ? [] : getMockTools(server.name)
  }, [serverTools, status, server.name, getMockTools])

  const [toolStates, setToolStates] = useState<Record<string, boolean>>({})

  // Update tool states when tools change
  React.useEffect(() => {
    if (tools.length > 0) {
      const newStates = tools.reduce((acc, tool) => {
        acc[tool.name] = tool.enabled
        return acc
      }, {} as Record<string, boolean>)
      setToolStates(newStates)
    } else {
      setToolStates({})
    }
  }, [tools])

  const statusConfig = {
    connected: {
      color: 'bg-green-500',
      label: 'Connected',
      textColor: 'text-green-400'
    },
    connecting: {
      color: 'bg-yellow-500',
      label: 'Connecting...',
      textColor: 'text-yellow-400'
    },
    error: {
      color: 'bg-red-500',
      label: 'Error',
      textColor: 'text-red-400'
    },
    disconnected: {
      color: 'bg-gray-500',
      label: 'Disconnected',
      textColor: 'text-gray-400'
    }
  }

  const handleToggleEnabled = (enabled: boolean) => {
    // Update UI state immediately
    setOptimisticEnabled(enabled)
    toast.success(`Server ${enabled ? 'enabled' : 'disabled'}`)
    
    // Fire and forget the mutation
    toggleServerMutation.mutate({
      id: server.id,
      enabled
    }, {
      onSuccess: () => {
        onUpdate()
      },
      onError: (error) => {
        // Revert optimistic state on error
        setOptimisticEnabled(server.enabled)
        toast.error('Failed to update server')
        console.error('Toggle server error:', error)
        onUpdate() // Refresh to show correct state
      }
    })
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${server.name}"?`)) {
      return
    }

    try {
      await deleteServerMutation.mutateAsync({ id: server.id })
      onUpdate()
      toast.success('Server deleted')
    } catch (error) {
      toast.error('Failed to delete server')
      console.error('Delete server error:', error)
    }
  }

  const handleTestConnection = async () => {
    try {
      const result = await testConnectionMutation.mutateAsync({
        command: server.command,
        args: server.args
      })
      
      if (result.success) {
        toast.success('Connection test successful')
      } else {
        toast.error(result.error || 'Connection test failed')
      }
    } catch (error) {
      toast.error('Connection test failed')
      console.error('Test connection error:', error)
    }
  }

  const currentStatus = statusConfig[status]
  
  // Get first letter of server name for avatar
  const avatarLetter = server.name.charAt(0).toUpperCase()
  
  // Calculate enabled tools based on current state
  const currentEnabledCount = useMemo(() => 
    Object.values(toolStates).filter(Boolean).length, 
    [toolStates]
  )
  
  const handleToolToggle = (toolName: string) => {
    setToolStates(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }))
  }

  // Dynamic border radius classes
  const borderClasses = `
    ${isFirst && !isExpanded ? 'rounded-t-lg' : ''} 
    ${isLast && !isExpanded ? 'rounded-b-lg' : ''} 
    ${isFirst && isLast && !isExpanded ? 'rounded-lg' : ''}
    ${isExpanded ? (isFirst ? 'rounded-t-lg' : '') : ''}
  `.trim()

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={`border-x border-white/10 bg-black/10 ${borderClasses} ${isFirst ? 'border-t border-t-white/10' : ''} ${isLast && !isExpanded ? 'border-b border-b-white/10' : ''}`}>
        {/* Main Server Row */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-3">
            {/* Avatar with Status Dot */}
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-neutral-600 flex items-center justify-center text-white text-sm font-medium">
                {avatarLetter}
              </div>
              {/* Status dot positioned at bottom-right */}
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-800 ${currentStatus.color}`} />
            </div>

            {/* Server Info */}
            <div className="flex-1">
              <div className="font-medium text-white">{server.name}</div>
              <div className="text-sm text-neutral-400">
                {server.command} {server.args.join(' ')}
              </div>
            </div>

            {/* Tools Dropdown */}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-neutral-400 hover:text-white hover:bg-white/10">
                <span className="text-xs mr-1">
                  {toolsLoading ? 'Loading...' : `${currentEnabledCount} ${tools.length === 1 ? 'tool' : 'tools'} enabled`}
                </span>
                <ChevronsUpDown className="h-3 w-3" />
              </Button>
            </CollapsibleTrigger>
          </div>

          <div className="flex items-center space-x-2">
            {/* Enable/Disable Switch */}
            <Switch
              checked={optimisticEnabled}
              onCheckedChange={handleToggleEnabled}
              className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
            />

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-neutral-400 hover:text-white">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[160px]">
                <DropdownMenuItem onClick={handleTestConnection} disabled={testConnectionMutation.isPending}>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Connection
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleDelete} 
                  disabled={deleteServerMutation.isPending}
                  className="text-red-400 focus:text-red-400"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Expanded Tools List */}
        <CollapsibleContent>
          <div className={`bg-black/30 ${isLast ? 'rounded-b-lg' : ''}`}>
            {toolsLoading ? (
              <div className="flex items-center justify-center px-8 py-4">
                <div className="text-sm text-neutral-400">Loading tools...</div>
              </div>
            ) : tools.length === 0 ? (
              <div className="flex items-center justify-center px-8 py-4">
                <div className="text-sm text-neutral-400">
                  {status === 'connected' ? 'No tools available' : 'Server not connected'}
                </div>
              </div>
            ) : tools.map((tool, index) => (
              <div key={tool.name}>
                <div 
                  className={`flex items-center justify-between px-8 py-2 hover:bg-white/5 cursor-pointer transition-colors ${!toolStates[tool.name] ? 'opacity-50' : ''}`}
                  onClick={() => handleToolToggle(tool.name)}
                >
                  <span className={`text-sm font-mono ${toolStates[tool.name] ? 'text-neutral-200' : 'text-neutral-500'}`}>
                    {tool.name}
                  </span>
                </div>
                {index < tools.length - 1 && (
                  <div className="mx-8 border-b border-white/10" />
                )}
              </div>
            ))}
            {isLast && <div className="h-0.5" />}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
