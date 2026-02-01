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
