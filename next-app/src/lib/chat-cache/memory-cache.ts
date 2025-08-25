'use client'

import type { CachedChat, CachedMessage, ChatCacheData, CacheConfig } from './types'

/**
 * Hot memory cache for instant chat access
 * LRU eviction when memory limit is reached
 */
export class MemoryChatCache {
  private chatData = new Map<string, ChatCacheData>()
  private accessOrder = new Map<string, number>() // chatId -> last access timestamp
  private accessCounter = 0

  constructor(private config: CacheConfig) {
    this.log('MemoryChatCache initialized with limit:', config.memoryLimit)
  }

  private log(message: string, ...args: any[]) {
    if (this.config.enableDetailedLogging) {
      console.log(`[MemoryCache] ${message}`, ...args)
    }
  }

  get(chatId: string): ChatCacheData | null {
    const startTime = performance.now()
    const data = this.chatData.get(chatId)
    
    if (data) {
      // Update access time for LRU
      this.accessOrder.set(chatId, ++this.accessCounter)
      const elapsed = performance.now() - startTime
      this.log(`Memory cache HIT for ${chatId} (${elapsed.toFixed(2)}ms)`)
      return data
    }

    this.log(`Memory cache MISS for ${chatId}`)
    return null
  }

  set(chatId: string, data: ChatCacheData): void {
    const startTime = performance.now()

    // Check if we need to evict
    if (this.chatData.size >= this.config.memoryLimit && !this.chatData.has(chatId)) {
      this.evictLRU()
    }

    this.chatData.set(chatId, data)
    this.accessOrder.set(chatId, ++this.accessCounter)

    const elapsed = performance.now() - startTime
    this.log(`Cached ${chatId} in memory with ${data.messages.length} messages (${elapsed.toFixed(2)}ms)`)
    this.logStats()
  }

  has(chatId: string): boolean {
    return this.chatData.has(chatId)
  }

  delete(chatId: string): boolean {
    const deleted = this.chatData.delete(chatId)
    this.accessOrder.delete(chatId)
    
    if (deleted) {
      this.log(`Removed ${chatId} from memory cache`)
      this.logStats()
    }
    
    return deleted
  }

  clear(): void {
    const size = this.chatData.size
    this.chatData.clear()
    this.accessOrder.clear()
    this.accessCounter = 0
    this.log(`Cleared memory cache (${size} items removed)`)
  }

  getAllChatIds(): string[] {
    return Array.from(this.chatData.keys())
  }

  updateChatMetadata(chatId: string, updates: Partial<CachedChat>): boolean {
    const data = this.chatData.get(chatId)
    if (!data) return false

    data.chat = { ...data.chat, ...updates }
    this.accessOrder.set(chatId, ++this.accessCounter)
    
    this.log(`Updated chat metadata for ${chatId}:`, updates)
    return true
  }

  addMessage(chatId: string, message: CachedMessage): boolean {
    const data = this.chatData.get(chatId)
    if (!data) return false

    // Add message in chronological order
    const insertIndex = data.messages.findIndex(m => 
      m.createdAt > message.createdAt || 
      (m.createdAt.getTime() === message.createdAt.getTime() && (m.index || 0) > (message.index || 0))
    )

    if (insertIndex === -1) {
      data.messages.push(message)
    } else {
      data.messages.splice(insertIndex, 0, message)
    }

    this.accessOrder.set(chatId, ++this.accessCounter)
    this.log(`Added message ${message.id} to chat ${chatId} (${data.messages.length} total messages)`)
    return true
  }

  removeMessage(chatId: string, messageId: string): boolean {
    const data = this.chatData.get(chatId)
    if (!data) return false

    const initialLength = data.messages.length
    data.messages = data.messages.filter(m => m.id !== messageId)
    
    if (data.messages.length < initialLength) {
      this.accessOrder.set(chatId, ++this.accessCounter)
      this.log(`Removed message ${messageId} from chat ${chatId} (${data.messages.length} messages remaining)`)
      return true
    }

    return false
  }

  removeMessagesAfter(chatId: string, messageId: string): CachedMessage[] {
    const data = this.chatData.get(chatId)
    if (!data) return []

    const messageIndex = data.messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) return []

    const removedMessages = data.messages.splice(messageIndex)
    this.accessOrder.set(chatId, ++this.accessCounter)
    
    this.log(`Removed ${removedMessages.length} messages after ${messageId} from chat ${chatId}`)
    return removedMessages
  }

  getStats() {
    const usage = {
      size: this.chatData.size,
      limit: this.config.memoryLimit,
      utilizationPercent: (this.chatData.size / this.config.memoryLimit) * 100,
      totalMessages: Array.from(this.chatData.values()).reduce((sum, data) => sum + data.messages.length, 0)
    }

    return usage
  }

  private evictLRU(): void {
    if (this.chatData.size === 0) return

    // Find the least recently used chat
    let oldestAccess = Infinity
    let lruChatId = ''

    for (const [chatId, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime
        lruChatId = chatId
      }
    }

    if (lruChatId) {
      const data = this.chatData.get(lruChatId)
      this.chatData.delete(lruChatId)
      this.accessOrder.delete(lruChatId)
      
      this.log(`Evicted LRU chat ${lruChatId} (${data?.messages.length || 0} messages) to make room`)
      this.logStats()
    }
  }

  private logStats(): void {
    if (!this.config.enableDetailedLogging) return
    
    const stats = this.getStats()
    this.log(`Memory usage: ${stats.size}/${stats.limit} chats (${stats.utilizationPercent.toFixed(1)}%), ${stats.totalMessages} total messages`)
  }

  // Preload specific chats into memory
  preload(chatsData: ChatCacheData[]): void {
    const startTime = performance.now()
    let loaded = 0

    for (const data of chatsData) {
      // Only preload if we have room or if it's a pinned chat
      if (this.chatData.size < this.config.memoryLimit || data.chat.pinned) {
        if (!this.chatData.has(data.chat.id)) {
          this.set(data.chat.id, data)
          loaded++
        }
      }
    }

    const elapsed = performance.now() - startTime
    this.log(`Preloaded ${loaded} chats into memory in ${elapsed.toFixed(2)}ms`)
  }
}
