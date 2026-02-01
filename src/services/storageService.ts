// Local Storage Service for saving/loading itineraries and user preferences
import { DetailedItinerary, BudgetData } from './plannerApi';

const STORAGE_KEYS = {
  SAVED_ITINERARIES: 'planneeer_saved_itineraries',
  RECENT_SEARCHES: 'planneeer_recent_searches',
  USER_PREFERENCES: 'planneeer_user_preferences',
};

export interface SavedItinerary {
  id: string;
  createdAt: string;
  updatedAt: string;
  query?: string;
  itinerary: DetailedItinerary;
  budget: BudgetData;
  isFavorite?: boolean;
}

export interface RecentSearch {
  query: string;
  timestamp: string;
  resultCount?: number;
}

export interface UserPreferences {
  defaultStartTime: string;
  maxWalkingMinutes: number;
  preferredBudget: 'budget' | 'moderate' | 'premium';
  homeLocation?: { lat: number; lng: number; address: string };
}

// Generate a unique ID for itineraries
function generateId(): string {
  return `itin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// --- Saved Itineraries ---

/**
 * Get all saved itineraries from localStorage
 */
export function getSavedItineraries(): SavedItinerary[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SAVED_ITINERARIES);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('[StorageService] Failed to get saved itineraries:', error);
    return [];
  }
}

/**
 * Save a new itinerary to localStorage
 */
export function saveItinerary(
  itinerary: DetailedItinerary,
  budget: BudgetData,
  query?: string
): SavedItinerary {
  try {
    const existing = getSavedItineraries();
    
    const newItinerary: SavedItinerary = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      query,
      itinerary,
      budget,
      isFavorite: false,
    };
    
    // Add to beginning of array (most recent first)
    const updated = [newItinerary, ...existing];
    
    // Keep only last 50 itineraries to avoid storage bloat
    const trimmed = updated.slice(0, 50);
    
    localStorage.setItem(STORAGE_KEYS.SAVED_ITINERARIES, JSON.stringify(trimmed));
    
    console.log('[StorageService] Saved itinerary:', newItinerary.id);
    return newItinerary;
  } catch (error) {
    console.error('[StorageService] Failed to save itinerary:', error);
    throw error;
  }
}

/**
 * Update an existing itinerary
 */
export function updateItinerary(id: string, updates: Partial<SavedItinerary>): SavedItinerary | null {
  try {
    const itineraries = getSavedItineraries();
    const index = itineraries.findIndex(i => i.id === id);
    
    if (index === -1) return null;
    
    itineraries[index] = {
      ...itineraries[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    localStorage.setItem(STORAGE_KEYS.SAVED_ITINERARIES, JSON.stringify(itineraries));
    return itineraries[index];
  } catch (error) {
    console.error('[StorageService] Failed to update itinerary:', error);
    return null;
  }
}

/**
 * Toggle favorite status of an itinerary
 */
export function toggleItineraryFavorite(id: string): boolean {
  const itineraries = getSavedItineraries();
  const itinerary = itineraries.find(i => i.id === id);
  if (!itinerary) return false;
  
  const updated = updateItinerary(id, { isFavorite: !itinerary.isFavorite });
  return updated?.isFavorite ?? false;
}

/**
 * Delete an itinerary by ID
 */
export function deleteItinerary(id: string): boolean {
  try {
    const itineraries = getSavedItineraries();
    const filtered = itineraries.filter(i => i.id !== id);
    
    if (filtered.length === itineraries.length) return false;
    
    localStorage.setItem(STORAGE_KEYS.SAVED_ITINERARIES, JSON.stringify(filtered));
    console.log('[StorageService] Deleted itinerary:', id);
    return true;
  } catch (error) {
    console.error('[StorageService] Failed to delete itinerary:', error);
    return false;
  }
}

/**
 * Get a single itinerary by ID
 */
export function getItineraryById(id: string): SavedItinerary | null {
  const itineraries = getSavedItineraries();
  return itineraries.find(i => i.id === id) || null;
}

// --- Recent Searches ---

/**
 * Get recent search queries
 */
export function getRecentSearches(): RecentSearch[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('[StorageService] Failed to get recent searches:', error);
    return [];
  }
}

/**
 * Add a search to recent history
 */
export function addRecentSearch(query: string, resultCount?: number): void {
  try {
    const searches = getRecentSearches();
    
    // Remove duplicates
    const filtered = searches.filter(s => s.query.toLowerCase() !== query.toLowerCase());
    
    // Add new search at beginning
    const newSearch: RecentSearch = {
      query,
      timestamp: new Date().toISOString(),
      resultCount,
    };
    
    const updated = [newSearch, ...filtered].slice(0, 20); // Keep last 20
    
    localStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(updated));
  } catch (error) {
    console.error('[StorageService] Failed to add recent search:', error);
  }
}

/**
 * Clear recent searches
 */
export function clearRecentSearches(): void {
  localStorage.removeItem(STORAGE_KEYS.RECENT_SEARCHES);
}

// --- User Preferences ---

const DEFAULT_PREFERENCES: UserPreferences = {
  defaultStartTime: '10:00',
  maxWalkingMinutes: 15,
  preferredBudget: 'moderate',
};

/**
 * Get user preferences
 */
export function getUserPreferences(): UserPreferences {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    if (!data) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(data) };
  } catch (error) {
    console.error('[StorageService] Failed to get user preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save user preferences
 */
export function saveUserPreferences(preferences: Partial<UserPreferences>): UserPreferences {
  try {
    const current = getUserPreferences();
    const updated = { ...current, ...preferences };
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('[StorageService] Failed to save user preferences:', error);
    return getUserPreferences();
  }
}

// --- Utility ---

/**
 * Clear all stored data
 */
export function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  console.log('[StorageService] Cleared all data');
}

/**
 * Get storage usage info
 */
export function getStorageInfo(): { used: number; items: number } {
  let totalSize = 0;
  let itemCount = 0;
  
  Object.values(STORAGE_KEYS).forEach(key => {
    const data = localStorage.getItem(key);
    if (data) {
      totalSize += data.length * 2; // UTF-16 encoding
      itemCount++;
    }
  });
  
  return { used: totalSize, items: itemCount };
}
