// Events API Service - MongoDB Integration
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// NYC Event format from events_v2 collection
export interface NYCEvent {
  _id: string;
  event_id: string;
  name: string;
  event_type: string;
  location: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
    borough: string;
    neighborhood: string;
    venue: string;
  };
  timing: {
    startDate: string;
    endDate: string;
    is_annual: boolean;
  };
  vibe_metadata: {
    tags: string[];
    description: string;
    ideal_for: string[];
  };
  source: string;
  source_url: string;
  price: string;
  createdAt: string;
}

// Legacy interface for backward compatibility
export interface CityEvent {
  _id: string;
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  venue: {
    name: string;
    lat: number;
    lng: number;
    address?: string;
  };
  categories?: string[];
  price?: string;
  source?: string;
  source_url?: string;
  photo_name?: string;
  image_url?: string;
}

// Backward compatibility alias
export type BostonEvent = CityEvent;

// Fetch all NYC events from MongoDB
export async function fetchEvents(): Promise<CityEvent[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/nyc/events`);
    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data: NYCEvent[] = await response.json();

    // Convert NYC format to CityEvent format for compatibility
    return data.map(e => ({
      _id: e._id,
      id: e.event_id,
      title: e.name,
      description: e.vibe_metadata?.description || '',
      start_time: (() => {
        // HACK: Force all events to appear as "Today" for demo
        const now = new Date();
        const start = new Date(e.timing?.startDate || now.toISOString());
        start.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
        return start.toISOString();
      })(),
      end_time: (() => {
        const now = new Date();
        const end = new Date(e.timing?.endDate || now.toISOString());
        end.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
        return end.toISOString();
      })(),
      venue: {
        name: e.location?.venue || e.location?.neighborhood || 'NYC',
        lng: e.location?.coordinates?.[0] || -73.9855,
        lat: e.location?.coordinates?.[1] || 40.7580,
        address: `${e.location?.neighborhood || ''}, ${e.location?.borough || ''}`
      },
      categories: e.vibe_metadata?.tags || [e.event_type],
      price: e.price || 'TBD',
      source: e.source,
      source_url: e.source_url,
    }));
  } catch (error) {
    console.error('Failed to fetch NYC events:', error);
    return [];
  }
}

// Convert events to GeoJSON for Mapbox
export function eventsToGeoJSON(events: CityEvent[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = events
    .filter(e => e.venue?.lat && e.venue?.lng)
    .map(event => {
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [event.venue.lng, event.venue.lat]
        },
        properties: {
          id: event._id,
          title: event.title,
          description: event.description,
          startTime: event.start_time,
          endTime: event.end_time,
          venueName: event.venue.name,
          categories: event.categories?.join(', ') || '',
          price: event.price || 'Free',
          source: event.source || '',
          sourceUrl: event.source_url || '',
          photoName: event.photo_name || '',
        },
      };
    });

  return { type: 'FeatureCollection', features };
}

// Format date for display
export function formatEventDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format time for display
export function formatEventTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
