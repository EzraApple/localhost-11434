'use client'

import { api } from '~/trpc/react'
import type { 
  CachedChat, 
  CachedMessage, 
  ChatCacheData, 
  CacheResult, 
  CacheStats,
  CacheConfig,
  CacheSource 
} from './types'
import { IndexedDBChatStore } from './indexeddb-store'
import { MemoryChatCache } from './memory-cache'
import { DEFAULT_CACHE_CONFIG } from './types'

/**
 * Unified cache manager coordinating Memory -> IndexedDB -> SQLite
 * Provides cache-first data access with graceful fallbacks
 */
export class ChatCacheManager {
  private indexedDB: IndexedDBChatStore
  private memoryCache: MemoryChatCache
  private stats: CacheStats = {
    memoryHits: 0,
    indexedDBHits: 0,
    sqliteHits: 0,
    misses: 0,
    totalRequests: 0,
    avgLoadTime: 0
  }
  private syncInProgress = new Set<string>()
  private initPromise: Promise<void> | null = null

  constructor(private config: CacheConfig = DEFAULT_CACHE_CONFIG) {
    this.log('ChatCacheManager initializing with config:', config)
    this.indexedDB = new IndexedDBChatStore(config)
    this.memoryCache = new MemoryChatCache(config)
  }

  private log(message: string, ...args: any[]) {
    if (this.config.enableDetailedLogging) {
      console.log(`[CacheManager] ${message}`, ...args)
    }
  }

  private logError(message: string, error: any) {
    console.error(`[CacheManager ERROR] ${message}`, error)
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = this._initialize()
    return this.initPromise
  }

  private async _initialize(): Promise<void> {
    const startTime = performance.now()
    this.log('Initializing cache manager...')

    try {
      await this.indexedDB.initialize()
      
      // Pre-populate memory cache with recent/pinned chats
      await this.preloadMemoryCache()
      
      const elapsed = performance.now() - startTime
      this.log(`Cache manager initialized successfully in ${elapsed.toFixed(2)}ms`)
    } catch (error) {
      this.logError('Failed to initialize cache manager', error)
      throw error
    }
  }

  /**
   * Get chat data with cache-first approach
   * Memory -> IndexedDB -> SQLite (TRPC)
   */
  async getChatData(chatId: string): Promise<CacheResult<ChatCacheData>> {
    const startTime = performance.now()
    this.stats.totalRequests++
    this.log(`Getting chat data for ${chatId}...`)

    try {
      // 1. Check memory cache first (fastest)
      const memoryData = this.memoryCache.get(chatId)
      if (memoryData) {
        this.stats.memoryHits++
        const loadTime = performance.now() - startTime
        this.updateAvgLoadTime(loadTime)
        this.log(`✓ Memory cache hit for ${chatId} (${loadTime.toFixed(2)}ms)`)
        return {
          data: memoryData,
          source: 'memory',
          loadTime,
          fromCache: true
        }
      }

      // 2. Check IndexedDB (fast)
      await this.initialize()
      const indexedDBData = await this.indexedDB.getChatData(chatId)
      if (indexedDBData) {
        this.stats.indexedDBHits++
        
        // Cache in memory for next access
        this.memoryCache.set(chatId, indexedDBData)
        
        const loadTime = performance.now() - startTime
        this.updateAvgLoadTime(loadTime)
        this.log(`✓ IndexedDB cache hit for ${chatId} (${loadTime.toFixed(2)}ms)`)
        return {
          data: indexedDBData,
          source: 'indexeddb',
          loadTime,
          fromCache: true
        }
      }

      // 3. Fallback to SQLite via TRPC (slowest)
      this.log(`Cache miss for ${chatId}, fetching from SQLite...`)
      const sqliteData = await this.fetchFromSQLite(chatId)
      
      if (sqliteData) {
        this.stats.sqliteHits++
        
        // Cache the data for future access
        await this.cacheData(chatId, sqliteData)
        
        const loadTime = performance.now() - startTime
        this.updateAvgLoadTime(loadTime)
        this.log(`✓ SQLite fetch for ${chatId} (${loadTime.toFixed(2)}ms)`)
        return {
          data: sqliteData,
          source: 'sqlite',
          loadTime,
          fromCache: false
        }
      }

      // 4. Not found anywhere
      this.stats.misses++
      const loadTime = performance.now() - startTime
      this.log(`✗ Chat ${chatId} not found in any cache layer (${loadTime.toFixed(2)}ms)`)
      return {
        data: null,
        source: 'not_found',
        loadTime,
        fromCache: false
      }

    } catch (error) {
      this.logError(`Failed to get chat data for ${chatId}`, error)
      return {
        data: null,
        source: 'not_found',
        loadTime: performance.now() - startTime,
        fromCache: false
      }
    }
  }

  /**
   * Cache chat data across all layers
   */
  async cacheData(chatId: string, data: ChatCacheData): Promise<boolean> {
    try {
      // Cache in memory immediately
      this.memoryCache.set(chatId, data)
      
      // Cache in IndexedDB (background)
      const indexedDBSuccess = await this.indexedDB.setChatData(data)
      if (!indexedDBSuccess) {
        this.logError(`Failed to cache ${chatId} in IndexedDB`, null)
      }
      
      this.log(`Cached chat ${chatId} across all cache layers`)
      return true
    } catch (error) {
      this.logError(`Failed to cache chat ${chatId}`, error)
      return false
    }
  }

  /**
   * Get all cached chats (for sidebar display)
   */
  async getAllChats(): Promise<CachedChat[]> {
    const startTime = performance.now()
    this.log('Getting all cached chats...')

    try {
      // Get from IndexedDB (most complete list)
      await this.initialize()
      const indexedDBChats = await this.indexedDB.getAllChats()
      
      // Also check memory cache for any additional chats
      const memoryChatIds = this.memoryCache.getAllChatIds()
      const memoryOnlyChats: CachedChat[] = []
      
      for (const chatId of memoryChatIds) {
        if (!indexedDBChats.find(c => c.id === chatId)) {
          const memoryData = this.memoryCache.get(chatId)
          if (memoryData) {
            memoryOnlyChats.push(memoryData.chat)
          }
        }
      }

      const allChats = [...indexedDBChats, ...memoryOnlyChats]
      const elapsed = performance.now() - startTime
      this.log(`Retrieved ${allChats.length} cached chats (${elapsed.toFixed(2)}ms)`)
      
      return allChats
    } catch (error) {
      this.logError('Failed to get all chats', error)
      return []
    }
  }

  /**
   * Add a new message to cache immediately (write-through)
   */
  async addMessage(chatId: string, message: CachedMessage): Promise<boolean> {
    try {
      // Add to memory cache immediately
      const memorySuccess = this.memoryCache.addMessage(chatId, message)
      
      if (!memorySuccess) {
        // If not in memory, try to load the chat first
        const chatData = await this.getChatData(chatId)
        if (chatData.data) {
          chatData.data.messages.push(message)
          this.memoryCache.set(chatId, chatData.data)
        }
      }

      // Update IndexedDB (background)
      const data = this.memoryCache.get(chatId)
      if (data) {
        await this.indexedDB.setChatData(data)
      }

      this.log(`Added message ${message.id} to chat ${chatId}`)
      return true
    } catch (error) {
      this.logError(`Failed to add message to cache`, error)
      return false
    }
  }

  /**
   * Remove chat from all cache layers
   */
  async deleteChat(chatId: string): Promise<boolean> {
    try {
      // Remove from memory
      this.memoryCache.delete(chatId)
      
      // Remove from IndexedDB
      await this.indexedDB.deleteChat(chatId)
      
      this.log(`Deleted chat ${chatId} from all cache layers`)
      return true
    } catch (error) {
      this.logError(`Failed to delete chat ${chatId}`, error)
      return false
    }
  }

  /**
   * Clear all cache data
   */
  async clearAll(): Promise<boolean> {
    try {
      this.memoryCache.clear()
      await this.indexedDB.clearAll()
      this.resetStats()
      this.log('Cleared all cache data')
      return true
    } catch (error) {
      this.logError('Failed to clear cache', error)
      return false
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { memoryUsage: any; storageUsage?: any } {
    return {
      ...this.stats,
      memoryUsage: this.memoryCache.getStats()
    }
  }

  /**
   * Preload memory cache with important chats
   */
  private async preloadMemoryCache(): Promise<void> {
    try {
      const allChats = await this.indexedDB.getAllChats()
      
      // Sort by importance: pinned first, then by recent activity
      const importantChats = allChats
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1
          if (!a.pinned && b.pinned) return 1
          return (b.lastMessageAt?.getTime() || 0) - (a.lastMessageAt?.getTime() || 0)
        })
        .slice(0, Math.min(this.config.memoryLimit, allChats.length))

      // Load chat data for important chats
      const chatDataPromises = importantChats.map(async chat => {
        const data = await this.indexedDB.getChatData(chat.id)
        return data
      })

      const chatDataResults = await Promise.all(chatDataPromises)
      const validChatData = chatDataResults.filter(data => data !== null) as ChatCacheData[]
      
      this.memoryCache.preload(validChatData)
      this.log(`Preloaded ${validChatData.length} important chats into memory`)
    } catch (error) {
      this.logError('Failed to preload memory cache', error)
    }
  }

  /**
   * Fetch chat data from SQLite via TRPC
   * Note: This method returns null to delegate SQLite fetching to the hook level
   * where TRPC can be called properly within React's component lifecycle
   */
  private async fetchFromSQLite(chatId: string): Promise<ChatCacheData | null> {
    // SQLite fetching is handled at the hook level (useCachedChatData)
    // since TRPC calls must be made within React component lifecycle
    this.log(`SQLite fetch for ${chatId} - delegating to hook level`)
    return null
  }

  private updateAvgLoadTime(loadTime: number): void {
    this.stats.avgLoadTime = (this.stats.avgLoadTime * (this.stats.totalRequests - 1) + loadTime) / this.stats.totalRequests
  }

  private resetStats(): void {
    this.stats = {
      memoryHits: 0,
      indexedDBHits: 0,
      sqliteHits: 0,
      misses: 0,
      totalRequests: 0,
      avgLoadTime: 0
    }
  }
}

// Global cache manager instance
let globalCacheManager: ChatCacheManager | null = null

export function getCacheManager(): ChatCacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new ChatCacheManager()
  }
  return globalCacheManager
}
