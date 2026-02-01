// Smart Planner API Service - Vector Search + AI Itinerary Building
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// Types matching the backend response
export interface ItineraryItem {
  id: string;
  type: 'transit' | 'food' | 'rideshare' | 'attraction' | 'landmark' | 'event';
  name: string;
  duration?: string;
  price?: string;
  priceRange?: string;
  icon: string;
  iconBg: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  description?: string;
  tags?: string[];
  cost: number;
  category: 'food' | 'activity' | 'transit';
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface BudgetData {
  food: number;
  activity: number;
  transit: number;
}

export interface PlanData {
  items: ItineraryItem[];
  budget: BudgetData;
  totalSpent: number;
}

export interface SmartPlanRequest {
  query: string;
  userLocation?: {
    lat: number;
    lng: number;
  };
}

export interface SmartPlanResponse {
  plans: {
    A: PlanData;
    B: PlanData;
  };
  query: string;
  parsedBudget: number | null;
  timeConstraint: string | null;
  searchResults: {
    places: number;
    events: number;
    landmarks: number;
  };
  took_ms: number;
}

export interface SearchResult {
  id: string;
  name: string;
  type: 'restaurant' | 'event' | 'landmark';
  category: string;
  rating?: number;
  price?: string;
  description?: string;
  address?: string;
  score?: number;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface SearchResponse {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: SearchResult;
  }>;
  metadata: {
    query: string;
    total: number;
    counts: {
      restaurants: number;
      events: number;
      landmarks: number;
    };
  };
}

/**
 * Call the smart planner API to get AI-generated itineraries
 * based on the user's natural language query.
 *
 * Example queries:
 * - "What's possible with $45 today?"
 * - "Find me a romantic dinner spot"
 * - "Cheap things to do this weekend"
 */
export async function getSmartPlan(request: SmartPlanRequest): Promise<SmartPlanResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/plan/smart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }

    const data: SmartPlanResponse = await response.json();
    return data;
  } catch (error) {
    console.error('[PlannerApi] Failed to get smart plan:', error);
    throw error;
  }
}

export type SearchType = 'restaurants' | 'events' | 'landmarks' | null;

/**
 * Call the search API to get raw semantic search results
 * @param query - The search query
 * @param limit - Maximum number of results per category
 * @param type - Optional filter to only search a specific category (restaurants, events, landmarks)
 */
export async function performSearch(query: string, limit: number = 30, type?: SearchType): Promise<SearchResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit, type }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }

    const data: SearchResponse = await response.json();
    return data;
  } catch (error) {
    console.error('[PlannerApi] Search failed:', error);
    throw error;
  }
}

/**
 * Helper function to calculate remaining budget
 */
export function getRemainingBudget(totalBudget: number, spent: BudgetData): number {
  const totalSpent = spent.food + spent.activity + spent.transit;
  return Math.max(0, totalBudget - totalSpent);
}

/**
 * Helper function to format budget display
 */
export function formatBudget(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Types for detailed itinerary
export interface TransitDirection {
  method: 'subway' | 'walk' | 'bus';
  duration: string;
  instructions: string;
  subwayLines?: string[];
  fromStation?: string;
  toStation?: string;
}

export interface DetailedStop {
  order: number;
  id: string;
  name: string;
  type: 'food' | 'activity' | 'landmark' | 'event';
  arrivalTime: string;
  departureTime: string;
  duration: string;
  whyVisit: string;
  whatToDo: string;
  proTip: string;
  cost: string;
  icon: string;
  iconBg: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  nearestStation?: {
    name: string;
    id: string;
    lines: string[];
    walkingMinutes: number;
  };
  transitToNext: TransitDirection | null;
}

export interface DetailedItinerary {
  title: string;
  overview: string;
  totalDuration: string;
  totalCost: string;
  stops: DetailedStop[];
  tips: string[];
}

export interface DetailedItineraryResponse {
  success: boolean;
  itinerary: DetailedItinerary;
  budget: BudgetData;
  totalSpent: number;
  took_ms: number;
}

export interface BuildDetailedItineraryRequest {
  items: Array<{
    id: string;
    name: string;
    type: string;
    description?: string;
    address?: string;
    price?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
    lat?: number;
    lng?: number;
  }>;
  userLocation?: {
    lat: number;
    lng: number;
    address?: string;
  };
  startTime?: string;
}

/**
 * Build a detailed AI-powered itinerary from user-selected items
 * Uses Gemini to create optimized route with subway directions, timing, and tips
 */
export async function buildDetailedItinerary(request: BuildDetailedItineraryRequest): Promise<DetailedItineraryResponse> {
  try {
    console.log('[PlannerApi] Building detailed itinerary for', request.items.length, 'items');
    
    const response = await fetch(`${API_BASE_URL}/api/plan/build-detailed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }

    const data: DetailedItineraryResponse = await response.json();
    console.log('[PlannerApi] Detailed itinerary built:', data.itinerary?.title);
    return data;
  } catch (error) {
    console.error('[PlannerApi] Failed to build detailed itinerary:', error);
    throw error;
  }
}

/**
 * Create an itinerary directly from a natural language query
 * E.g., "cozy restaurant, indian dinner, football game, brooklyn bridge"
 */
export async function createItineraryFromQuery(
  query: string,
  userLocation?: { lat: number; lng: number; address?: string }
): Promise<DetailedItineraryResponse> {
  try {
    console.log('[PlannerApi] Creating itinerary from query:', query);
    
    const response = await fetch(`${API_BASE_URL}/api/plan/from-query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, userLocation }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }

    const data: DetailedItineraryResponse = await response.json();
    console.log('[PlannerApi] Itinerary created from query:', data.itinerary?.title);
    return data;
  } catch (error) {
    console.error('[PlannerApi] Failed to create itinerary from query:', error);
    throw error;
  }
}

/**
 * Check if a query looks like an itinerary request vs a simple search
 */
export function isItineraryQuery(query: string): boolean {
  const itineraryKeywords = [
    'want to', 'wanna', 'planning to', 'would like to',
    'and then', 'after that', 'followed by',
    'for lunch', 'for dinner', 'for breakfast',
    'go to', 'visit', 'see', 'explore',
    'itinerary', 'plan', 'trip', 'day out',
    'multiple', 'few places', 'some places'
  ];
  
  const queryLower = query.toLowerCase();
  
  // Check for itinerary-style keywords
  const hasKeyword = itineraryKeywords.some(kw => queryLower.includes(kw));
  
  // Check for multiple items (commas or "and")
  const hasMultipleItems = (query.match(/,/g) || []).length >= 1 || 
                           (query.match(/\band\b/gi) || []).length >= 2;
  
  // Check if query is long enough to be a plan description
  const isLongEnough = query.split(' ').length >= 8;
  
  return hasKeyword || (hasMultipleItems && isLongEnough);
}
