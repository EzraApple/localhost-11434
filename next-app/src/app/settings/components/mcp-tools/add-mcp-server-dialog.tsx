'use client'

import { useState } from 'react'
import { api } from '~/trpc/react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { TestTube, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface AddMcpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onServerAdded: () => void
}

export function AddMcpServerDialog({ open, onOpenChange, onServerAdded }: AddMcpServerDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    command: 'npx',
    argsJson: '[]'
  })
  const [customCommand, setCustomCommand] = useState('')
  const [useCustomCommand, setUseCustomCommand] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Common package managers
  const commonCommands = [
    { value: 'npx', label: 'npx (Node.js)', example: '["@modelcontextprotocol/server-filesystem"]' },
    { value: 'uvx', label: 'uvx (Python/UV)', example: '["mcp-server-git"]' },
    { value: 'pipx', label: 'pipx (Python)', example: '["mcp-server-sqlite"]' },
    { value: 'pnpm dlx', label: 'pnpm dlx (Node.js)', example: '["@modelcontextprotocol/server-filesystem"]' },
    { value: 'yarn dlx', label: 'yarn dlx (Node.js)', example: '["@modelcontextprotocol/server-filesystem"]' },
    { value: 'bun x', label: 'bun x (Node.js)', example: '["@modelcontextprotocol/server-filesystem"]' },
  ]
  
  const currentCommand = useCustomCommand ? customCommand : formData.command
  const currentExample = commonCommands.find(cmd => cmd.value === formData.command)?.example || '["package-name", "--arg"]'

  const createServerMutation = api.mcp.createServer.useMutation()
  const testConnectionMutation = api.mcp.testConnection.useMutation()

  const parseArgsJson = (jsonString: string): string[] => {
    try {
      const parsed = JSON.parse(jsonString)
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed
      }
      throw new Error('Must be an array of strings')
    } catch {
      return []
    }
  }

  const handleTestConnection = async () => {
    const args = parseArgsJson(formData.argsJson)
    
    if (args.length === 0) {
      toast.error('Please provide valid JSON array of arguments')
      return
    }

    if (!currentCommand.trim()) {
      toast.error('Please specify a command')
      return
    }

    try {
      const result = await testConnectionMutation.mutateAsync({
        command: currentCommand,
        args: args
      })
      
      setTestResult(result)
      
      if (result.success) {
        toast.success('Connection test successful!')
      } else {
        toast.error(result.error || 'Connection test failed')
      }
    } catch (error) {
      setTestResult({ success: false, message: 'Connection test failed' })
      toast.error('Connection test failed')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast.error('Please provide a server name')
      return
    }

    if (!currentCommand.trim()) {
      toast.error('Please specify a command')
      return
    }

    const args = parseArgsJson(formData.argsJson)
    
    if (args.length === 0) {
      toast.error('Please provide valid JSON array of arguments')
      return
    }

    try {
      await createServerMutation.mutateAsync({
        name: formData.name.trim(),
        command: currentCommand,
        args: args
      })

      toast.success('MCP server added successfully!')
      onServerAdded()
      onOpenChange(false)
      
      // Reset form
      setFormData({
        name: '',
        command: 'npx',
        argsJson: '[]'
      })
      setCustomCommand('')
      setUseCustomCommand(false)
      setTestResult(null)
    } catch (error) {
      toast.error('Failed to add MCP server')
      console.error('Create server error:', error)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset form when closing
    setFormData({
      name: '',
      command: 'npx',
      argsJson: '[]'
    })
    setCustomCommand('')
    setUseCustomCommand(false)
    setTestResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Connect to a Model Context Protocol server to extend your AI's capabilities.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Server Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Server Name</Label>
            <Input
              id="name"
              placeholder="e.g., Filesystem Tools"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          {/* Package Manager */}
          <div className="space-y-2">
            <Label htmlFor="command">Package Manager</Label>
            <Select 
              value={useCustomCommand ? 'custom' : formData.command} 
              onValueChange={(value) => {
                if (value === 'custom') {
                  setUseCustomCommand(true)
                } else {
                  setUseCustomCommand(false)
                  setFormData(prev => ({ ...prev, command: value }))
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a package manager" />
              </SelectTrigger>
              <SelectContent>
                {commonCommands.map((cmd) => (
                  <SelectItem key={cmd.value} value={cmd.value}>
                    {cmd.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom Command</SelectItem>
              </SelectContent>
            </Select>
            
            {useCustomCommand && (
              <Input
                placeholder="e.g., python -m, ./my-script.sh, docker run ..."
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                className="mt-2"
              />
            )}
            
            <p className="text-xs text-neutral-500">
              Command must be available on the server. Common: npx (Node.js), uvx/pipx (Python)
            </p>
          </div>

          {/* Arguments */}
          <div className="space-y-2">
            <Label htmlFor="args">Arguments (JSON Array)</Label>
            <Textarea
              id="args"
              placeholder={currentExample}
              value={formData.argsJson}
              onChange={(e) => setFormData(prev => ({ ...prev, argsJson: e.target.value }))}
              className="min-h-[80px] font-mono text-sm"
              rows={3}
            />
            <p className="text-xs text-neutral-500">
              Enter arguments as a JSON array of strings. Examples vary by package manager.
            </p>
          </div>

          {/* Test Connection */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testConnectionMutation.isPending}
              className="w-full"
            >
              <TestTube className="h-4 w-4 mr-2" />
              {testConnectionMutation.isPending ? 'Testing...' : 'Test Connection'}
            </Button>
            
            {testResult && (
              <div className={`flex items-center space-x-2 text-sm ${
                testResult.success ? 'text-green-600' : 'text-red-600'
              }`}>
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createServerMutation.isPending}
              className="bg-[#113936] hover:bg-[#0f2f2c] text-white"
            >
              {createServerMutation.isPending ? 'Adding...' : 'Add Server'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
