

// NYC Landmark interface (matches MongoDB schema)
export interface NYCLandmark {
    _id: string;
    landmark_id: string;
    name: string;
    category: string;
    location: {
        type: string;
        coordinates: [number, number]; // [lng, lat]
        borough: string;
        neighborhood: string;
        altitude_meters?: number;
    };
    vibe_metadata?: {
        tags: string[];
        description: string;
        best_time_to_visit?: string;
        pro_tip?: string;
    };
    visual_assets?: {
        '3d_model_id'?: string;
        vascular_color?: string;
    };
}

// Legacy interface for backward compatibility
export interface Landmark {
    _id: string;
    name: string;
    description: string;
    category: string;
    address: string;
    latitude: number;
    longitude: number;
    imageUrl?: string;
    website?: string;
    visitDuration?: string;
    free?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Famous Boston Landmarks - Static data for now
// NYC Landmarks - To be populated or fetched from API
export const CITY_LANDMARKS: Landmark[] = [];

// Fetch landmarks from MongoDB (returns NYC format)
export async function fetchLandmarks(): Promise<NYCLandmark[]> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/landmarks`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to fetch landmarks:', error);
        return [];
    }
}

// Convert NYC landmarks to GeoJSON for Mapbox
export function landmarksToGeoJSON(landmarks: NYCLandmark[]): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = landmarks
        .filter(l => l.location?.coordinates && l.location.coordinates.length === 2)
        .map(landmark => {
            const [lng, lat] = landmark.location.coordinates;

            if (isNaN(lat) || isNaN(lng)) return null;

            // Determine marker color based on category
            let markerColor = '#8b5cf6'; // purple default
            const category = landmark.category?.toLowerCase() || '';

            if (category.includes('residential')) markerColor = '#06d6a0'; // teal
            else if (category.includes('historic') || category.includes('individual')) markerColor = '#b45309'; // amber
            else if (category.includes('museum')) markerColor = '#7c3aed'; // purple
            else if (category.includes('park')) markerColor = '#059669'; // green
            else if (category.includes('monument')) markerColor = '#64748b'; // slate
            else if (category.includes('attraction')) markerColor = '#0891b2'; // cyan
            else if (category.includes('scenic')) markerColor = '#10b981'; // emerald

            // Use visual_assets color if available
            if (landmark.visual_assets?.vascular_color) {
                markerColor = landmark.visual_assets.vascular_color;
            }

            return {
                type: 'Feature' as const,
                geometry: {
                    type: 'Point' as const,
                    coordinates: [lng, lat]
                },
                properties: {
                    id: landmark._id,
                    name: landmark.name,
                    description: landmark.vibe_metadata?.description || '',
                    category: landmark.category,
                    borough: landmark.location.borough,
                    neighborhood: landmark.location.neighborhood,
                    tags: landmark.vibe_metadata?.tags?.join(', ') || '',
                    bestTime: landmark.vibe_metadata?.best_time_to_visit || '',
                    proTip: landmark.vibe_metadata?.pro_tip || '',
                    markerColor,
                },
            };
        })
        .filter(f => f !== null) as GeoJSON.Feature[];

    return { type: 'FeatureCollection', features };
}

// Get category icon
export function getCategoryIcon(category: string): string {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('historic')) return '🏛️';
    if (cat.includes('museum')) return '🎨';
    if (cat.includes('park')) return '🌳';
    if (cat.includes('monument')) return '🗽';
    if (cat.includes('attraction') || cat.includes('scenic')) return '⭐';
    if (cat.includes('residential')) return '🏠';
    return '📍';
}
