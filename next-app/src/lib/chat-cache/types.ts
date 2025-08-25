/**
 * Type definitions for the chat cache system
 * Three-tier caching: Memory -> IndexedDB -> SQLite
 */

export interface CachedMessage {
  id: string
  chatId: string
  role: string
  parts: unknown
  createdAt: Date
  index: number | null
  // Cache metadata
  cachedAt: Date
  version: number
  isDirty: boolean // Needs sync to SQLite
}

export interface CachedChat {
  id: string
  title: string
  createdAt: Date
  lastMessageAt: Date | null
  pinned: boolean
  pinnedAt: Date | null
  lastSetModel: string | null
  lastSetPrompt: string | null
  // Cache metadata
  cachedAt: Date
  version: number
  isDirty: boolean
  messageCount: number
  lastSyncedAt: Date | null
}

export interface ChatCacheData {
  chat: CachedChat
  messages: CachedMessage[]
  isComplete: boolean // Whether all messages are cached
}

export type CacheSource = 'memory' | 'indexeddb' | 'sqlite' | 'not_found'

export interface CacheResult<T> {
  data: T | null
  source: CacheSource
  loadTime: number // ms
  fromCache: boolean
}

export interface CacheStats {
  memoryHits: number
  indexedDBHits: number
  sqliteHits: number
  misses: number
  totalRequests: number
  avgLoadTime: number
}

// IndexedDB Schema
export interface ChatCacheSchema {
  chats: {
    key: string // chatId
    value: CachedChat
  }
  messages: {
    key: [string, string] // [chatId, messageId]
    value: CachedMessage
  }
  metadata: {
    key: string // 'cache_stats' | 'last_full_sync' | etc
    value: any
  }
}

export interface CacheConfig {
  memoryLimit: number // Max items in memory cache
  indexedDBSizeLimit: number // Max storage size (bytes)
  syncInterval: number // Background sync interval (ms)
  preloadStrategy: 'recent' | 'all' | 'pinned'
  enableDetailedLogging: boolean
}

// Default configuration
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  memoryLimit: 50, // Keep 50 chats hot in memory
  indexedDBSizeLimit: 1024 * 1024 * 1024, // 1GB
  syncInterval: 30000, // 30 seconds
  preloadStrategy: 'all',
  enableDetailedLogging: true,
}
