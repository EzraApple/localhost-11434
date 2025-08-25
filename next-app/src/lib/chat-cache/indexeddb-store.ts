'use client'

import type { 
  CachedChat, 
  CachedMessage, 
  ChatCacheData, 
  ChatCacheSchema,
  CacheConfig 
} from './types'

/**
 * IndexedDB store for chat cache
 * Provides fast local persistence layer between memory and SQLite
 */
export class IndexedDBChatStore {
  private db: IDBDatabase | null = null
  private readonly dbName = 'ChatCache'
  private readonly dbVersion = 1
  private isInitialized = false
  private initPromise: Promise<void> | null = null
  
  constructor(private config: CacheConfig) {
    this.log('IndexedDBChatStore initialized with config:', config)
  }

  private log(message: string, ...args: any[]) {
    if (this.config.enableDetailedLogging) {
      console.log(`[IndexedDB] ${message}`, ...args)
    }
  }

  private logError(message: string, error: any) {
    console.error(`[IndexedDB ERROR] ${message}`, error)
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this._initialize()
    await this.initPromise
  }

  private async _initialize(): Promise<void> {
    this.log('Initializing IndexedDB...')
    const startTime = performance.now()

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        this.logError('IndexedDB not available', new Error('IndexedDB not supported'))
        reject(new Error('IndexedDB not supported'))
        return
      }

      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        this.logError('Failed to open IndexedDB', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        this.isInitialized = true
        const elapsed = performance.now() - startTime
        this.log(`IndexedDB initialized successfully in ${elapsed.toFixed(2)}ms`)
        resolve()
      }

      request.onupgradeneeded = (event) => {
        this.log('Upgrading IndexedDB schema...')
        const db = (event.target as IDBOpenDBRequest).result

        // Create chats store
        if (!db.objectStoreNames.contains('chats')) {
          const chatsStore = db.createObjectStore('chats', { keyPath: 'id' })
          chatsStore.createIndex('lastMessageAt', 'lastMessageAt')
          chatsStore.createIndex('pinned', 'pinned')
          chatsStore.createIndex('cachedAt', 'cachedAt')
          this.log('Created chats store with indexes')
        }

        // Create messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messagesStore = db.createObjectStore('messages', { keyPath: 'id' })
          messagesStore.createIndex('chatId', 'chatId')
          messagesStore.createIndex('chatId_createdAt', ['chatId', 'createdAt'])
          messagesStore.createIndex('cachedAt', 'cachedAt')
          this.log('Created messages store with indexes')
        }

        // Create metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' })
          this.log('Created metadata store')
        }
      }
    })
  }

  async getChatData(chatId: string): Promise<ChatCacheData | null> {
    await this.initialize()
    if (!this.db) return null

    const startTime = performance.now()
    this.log(`Getting chat data for ${chatId}...`)

    try {
      const transaction = this.db.transaction(['chats', 'messages'], 'readonly')
      
      // Get chat metadata
      const chatRequest = transaction.objectStore('chats').get(chatId)
      const chat = await this.promisifyRequest<CachedChat>(chatRequest)
      
      if (!chat) {
        this.log(`Chat ${chatId} not found in IndexedDB`)
        return null
      }

      // Get all messages for this chat
      const messagesRequest = transaction.objectStore('messages')
        .index('chatId')
        .getAll(chatId)
      const messages = await this.promisifyRequest<CachedMessage[]>(messagesRequest)

      const elapsed = performance.now() - startTime
      this.log(`Retrieved chat ${chatId} with ${messages?.length || 0} messages in ${elapsed.toFixed(2)}ms`)

      return {
        chat,
        messages: messages || [],
        isComplete: true // Assume complete for now
      }
    } catch (error) {
      this.logError(`Failed to get chat data for ${chatId}`, error)
      return null
    }
  }

  async setChatData(chatData: ChatCacheData): Promise<boolean> {
    await this.initialize()
    if (!this.db) return false

    const startTime = performance.now()
    const { chat, messages } = chatData
    this.log(`Caching chat ${chat.id} with ${messages.length} messages...`)

    try {
      const transaction = this.db.transaction(['chats', 'messages'], 'readwrite')
      
      // Store chat metadata
      const chatStore = transaction.objectStore('chats')
      await this.promisifyRequest(chatStore.put({
        ...chat,
        cachedAt: new Date(),
        version: (chat.version || 0) + 1
      }))

      // Store messages
      const messageStore = transaction.objectStore('messages')
      for (const message of messages) {
        await this.promisifyRequest(messageStore.put({
          ...message,
          cachedAt: new Date(),
          version: (message.version || 0) + 1
        }))
      }

      await this.promisifyTransaction(transaction)
      
      const elapsed = performance.now() - startTime
      this.log(`Cached chat ${chat.id} successfully in ${elapsed.toFixed(2)}ms`)
      return true
    } catch (error) {
      this.logError(`Failed to cache chat ${chat.id}`, error)
      return false
    }
  }

  async getAllChats(): Promise<CachedChat[]> {
    await this.initialize()
    if (!this.db) return []

    const startTime = performance.now()
    this.log('Getting all cached chats...')

    try {
      const transaction = this.db.transaction(['chats'], 'readonly')
      const request = transaction.objectStore('chats').getAll()
      const chats = await this.promisifyRequest<CachedChat[]>(request)
      
      const elapsed = performance.now() - startTime
      this.log(`Retrieved ${chats?.length || 0} cached chats in ${elapsed.toFixed(2)}ms`)
      
      return chats || []
    } catch (error) {
      this.logError('Failed to get all chats', error)
      return []
    }
  }

  async deleteChat(chatId: string): Promise<boolean> {
    await this.initialize()
    if (!this.db) return false

    const startTime = performance.now()
    this.log(`Deleting chat ${chatId} from cache...`)

    try {
      const transaction = this.db.transaction(['chats', 'messages'], 'readwrite')
      
      // Delete chat
      await this.promisifyRequest(transaction.objectStore('chats').delete(chatId))
      
      // Delete all messages for this chat
      const messageStore = transaction.objectStore('messages')
      const messagesRequest = messageStore.index('chatId').getAllKeys(chatId)
      const messageKeys = await this.promisifyRequest<IDBValidKey[]>(messagesRequest)
      
      for (const key of messageKeys || []) {
        await this.promisifyRequest(messageStore.delete(key))
      }

      await this.promisifyTransaction(transaction)
      
      const elapsed = performance.now() - startTime
      this.log(`Deleted chat ${chatId} from cache in ${elapsed.toFixed(2)}ms`)
      return true
    } catch (error) {
      this.logError(`Failed to delete chat ${chatId}`, error)
      return false
    }
  }

  async clearAll(): Promise<boolean> {
    await this.initialize()
    if (!this.db) return false

    this.log('Clearing all cached data...')

    try {
      const transaction = this.db.transaction(['chats', 'messages', 'metadata'], 'readwrite')
      
      await Promise.all([
        this.promisifyRequest(transaction.objectStore('chats').clear()),
        this.promisifyRequest(transaction.objectStore('messages').clear()),
        this.promisifyRequest(transaction.objectStore('metadata').clear())
      ])

      await this.promisifyTransaction(transaction)
      this.log('Cleared all cached data successfully')
      return true
    } catch (error) {
      this.logError('Failed to clear cache', error)
      return false
    }
  }

  async getStorageUsage(): Promise<{ used: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        return {
          used: estimate.usage || 0,
          quota: estimate.quota || 0
        }
      } catch (error) {
        this.logError('Failed to get storage estimate', error)
      }
    }
    return { used: 0, quota: 0 }
  }

  private promisifyRequest<T = any>(request: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  private promisifyTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.isInitialized = false
      this.log('IndexedDB connection closed')
    }
  }
}
