// Cache utility for storing and retrieving data
// Reduces API calls by caching responses locally

class DataCache {
  constructor() {
    this.cache = new Map();
    this.expiryTimes = new Map();
    this.listeners = new Map();
  }

  /**
   * Set data in cache with optional TTL (time to live)
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttl - Time to live in milliseconds (default: 5 minutes)
   */
  set(key, data, ttl = 5 * 60 * 1000) {
    this.cache.set(key, data);
    if (ttl > 0) {
      this.expiryTimes.set(key, Date.now() + ttl);
    }
    
    // Notify listeners
    this.notifyListeners(key, data);
    
    console.log(`[CACHE] Set: ${key}`, { ttl: `${ttl/1000}s`, size: this.cache.size });
  }

  /**
   * Get data from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached data or null if expired/not found
   */
  get(key) {
    if (!this.cache.has(key)) {
      console.log(`[CACHE] Miss: ${key}`);
      return null;
    }

    // Check if expired
    const expiryTime = this.expiryTimes.get(key);
    if (expiryTime && Date.now() > expiryTime) {
      console.log(`[CACHE] Expired: ${key}`);
      this.delete(key);
      return null;
    }

    console.log(`[CACHE] Hit: ${key}`);
    return this.cache.get(key);
  }

  /**
   * Delete specific key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
    this.expiryTimes.delete(key);
    console.log(`[CACHE] Delete: ${key}`);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.expiryTimes.clear();
    console.log(`[CACHE] Cleared all`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      expiryCount: this.expiryTimes.size
    };
  }

  /**
   * Subscribe to cache changes for a specific key
   * @param {string} key - Cache key to watch
   * @param {Function} callback - Callback function
   */
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    
    return () => {
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Notify all listeners for a key
   * @param {string} key - Cache key
   * @param {any} data - Updated data
   */
  notifyListeners(key, data) {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * Invalidate cache by pattern
   * @param {string} pattern - String or regex pattern
   */
  invalidatePattern(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const keysToDelete = Array.from(this.cache.keys()).filter(key => regex.test(key));
    keysToDelete.forEach(key => this.delete(key));
    console.log(`[CACHE] Invalidated pattern: ${pattern}`, keysToDelete);
  }
}

// Create singleton instance
const cache = new DataCache();

// Cache key generators
export const CACHE_KEYS = {
  USER_DETAILS: (userId) => `user_details_${userId}`,
  USER_BOOKMARKS: (userId) => `user_bookmarks_${userId}`,
  STORAGE_FILES: (userId) => `storage_files_${userId}`,
  AVATAR: (userId) => `avatar_${userId}`,
  EVENTS: (userId) => `events_${userId}`,
  TODOS: (userId) => `todos_${userId}`,
  PRODUCTS: () => `products_all`,
  SUPABASE_SESSION: () => `supabase_session`,
};

export default cache;
