import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CitySettings } from '../App';
// NYC Data
import nycRoutes from '../data/nycSubwayRoutes.json';
import nycStations from '../data/nycSubwayStations.json';
import { eventsToGeoJSON, fetchEvents } from '../services/eventsApi';
import { fetchLandmarks, landmarksToGeoJSON } from '../services/landmarksApi';
import { fetchLineStatuses, LineStatusMap } from '../services/mtaApi';
import { SearchResponse } from '../services/plannerApi';
import { fetchNYCRestaurants, nycRestaurantsToGeoJSON } from '../services/restaurantApi';
import './Map3D.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "";

export type LayerType = 'transit' | 'restaurants' | 'events' | 'landmarks' | null;

interface Map3DProps {
  settings: CitySettings;
  selectedLocation?: { location: [number, number]; name: string } | null;
  mapCommand?: {
    action: 'zoom_in' | 'zoom_out' | 'fly_to';
    location?: string;
    timestamp: number;
  } | null;
  itineraryRouteData?: any;
  searchResults?: SearchResponse | null;
  onRouteCalculated?: (routeInfo: { totalDuration: number; segments: Array<{ mode: string; duration: number }> }) => void;
  activeLayer?: LayerType;
  onActiveLayerChange?: (layer: LayerType) => void;
  onAddToItinerary?: (item: {
    id: string;
    name: string;
    type: 'restaurant' | 'event' | 'landmark';
    description?: string;
    address?: string;
    price?: string;
    rating?: number;
    coordinates?: { lat: number; lng: number };
    category?: string;
  }) => void;
  savedItemIds?: string[];
}

// New York City center (Times Square)
const NYC_CENTER: [number, number] = [-73.9855, 40.7580];


// Vascular Digital Twin color palette - MLK Weekend Edition
const VASCULAR_COLORS = {
  // Healthy flow - Cyan / Teal (Normal)
  healthyCyan: "#00E5FF",
  healthyCyanCore: "#1DE9B6",
  healthyCyanGlow: "#00E5FF",

  // Delayed - Amber / Orange (System Stress)
  delayAmber: "#FFB300",
  delayAmberCore: "#fff4e6",
  delayAmberGlow: "#FF9800",

  // Severe - Coral / Red (Critical Stress)
  severeRed: "#FF5252",
  severeRedCore: "#ffebee",
  severeRedGlow: "#E53935",

  // Offline / Cached - Muted Gray
  offlineGray: "#6B7280",

  // Sentiment colors...
  positive: "#00E5FF",
  negative: "#FFB300",
  neutral: "#6B7280",

  // Commuter rail colors
  commuterRailColor: "#56236E", // Brown/dark red for commuter rail
  commuterRailGlow: "#A0522D", // Sienna for glow

  // Amtrak colors
  amtrakColor: "#1e40af", // Deep blue for Amtrak

  // Dark atmosphere
  fogColor: "#0a0a0f",
  horizonColor: "#1a1a2e",
  spaceColor: "#000000",
};

// Interpolate color based on speed (fast = blue-white, slow = amber)
// Vascular flow colors based on speed and delay status
function getVascularColor(speed: number, hasDelay: boolean = false, maxSpeed: number = 60): { core: string; glow: string; trail: string } {
  // If route has delays, use amber/orange regardless of speed
  if (hasDelay) {
    return {
      core: VASCULAR_COLORS.delayAmberCore,
      glow: VASCULAR_COLORS.delayAmberGlow,
      trail: VASCULAR_COLORS.delayAmber,
    };
  }

  const t = Math.min(speed / maxSpeed, 1);

  if (t > 0.5) {
    // Fast: Electric Cyan (healthy flow)
    return {
      core: VASCULAR_COLORS.healthyCyanCore,
      glow: VASCULAR_COLORS.healthyCyanGlow,
      trail: VASCULAR_COLORS.healthyCyan,
    };
  } else if (t > 0.2) {
    // Medium: blend cyan to warm
    return {
      core: '#e0ffff',
      glow: '#00d4d4',
      trail: '#00e5e5',
    };
  } else {
    // Slow: warming towards delay colors
    return {
      core: VASCULAR_COLORS.delayAmberCore,
      glow: VASCULAR_COLORS.delayAmberGlow,
      trail: VASCULAR_COLORS.delayAmber,
    };
  }
}

// Linear interpolation for colors
function lerpColor(c1: string, c2: string, t: number): string {
  const hex1 = parseInt(c1.slice(1), 16);
  const hex2 = parseInt(c2.slice(1), 16);
  const r = Math.round(((hex1 >> 16) & 0xff) + (((hex2 >> 16) & 0xff) - ((hex1 >> 16) & 0xff)) * t);
  const g = Math.round(((hex1 >> 8) & 0xff) + (((hex2 >> 8) & 0xff) - ((hex1 >> 8) & 0xff)) * t);
  const b = Math.round((hex1 & 0xff) + ((hex2 & 0xff) - (hex1 & 0xff)) * t);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Helper function to format event date
function formatEventDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

// Helper function to format event time
function formatEventTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return dateString;
  }
}

// Generate HTML for place insights
function generatePlaceInsightHTML(place: any): string {
  return `<div class="place-popup">
    <h3>${place.name || 'Unknown Place'}</h3>
    <p>${place.address || ''}</p>
    ${place.rating ? `<div>⭐ ${place.rating}</div>` : ''}
  </div>`;
}

export default function Map3D({ settings, selectedLocation, mapCommand, itineraryRouteData, searchResults, onRouteCalculated, activeLayer: externalActiveLayer, onActiveLayerChange, onAddToItinerary, savedItemIds = [] }: Map3DProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const animationRef = useRef<number | null>(null);
  const mbtaIntervalRef = useRef<number | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const pulsePhaseRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const selectedBuildingRef = useRef<string | null>(null);

  // Real-time Line Status (MTA)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lineStatuses, setLineStatuses] = useState<LineStatusMap>({});
  const lineStatusesRef = useRef<LineStatusMap>({});

  // Poll for Line Status (every 30s)
  useEffect(() => {
    const fetchStatus = async () => {
      const statuses = await fetchLineStatuses();
      setLineStatuses(statuses);
      lineStatusesRef.current = statuses;

      // Update Map Source if map is ready
      if (map.current && map.current.getSource('nyc-routes')) {
        const source = map.current.getSource('nyc-routes') as mapboxgl.GeoJSONSource;
        const processedRoutes: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: (nycRoutes as GeoJSON.FeatureCollection).features.map(f => {
            const routeId = f.properties?.route_id;
            const statusData = statuses[routeId];

            // Default to Healthy Cyan (Assume normal if no data)
            let statusColor = VASCULAR_COLORS.healthyCyan;
            let status = 'NORMAL';

            if (statusData) {
              status = statusData.status;
              if (status === 'severe') statusColor = VASCULAR_COLORS.severeRed;
              else if (status === 'delayed') statusColor = VASCULAR_COLORS.delayAmber;
              else statusColor = VASCULAR_COLORS.healthyCyan;
            }

            return {
              ...f,
              properties: {
                ...f.properties,
                status: status || 'OFFLINE',
                statusReason: statusData?.reason || '',
                displayColor: statusColor // Computed color for style
              }
            };
          })
        };
        source.setData(processedRoutes);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // LERP State: Stores current "flight" data for every vehicle
  // id -> { startLng, startLat, endLng, endLat, startBearing, endBearing, startTime, duration }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const vehicleLerpRef = useRef<Map<string, unknown>>(new Map());


  const [isLoaded, setIsLoaded] = useState(false);
  // MBTA state removed

  // Ref to store savedItemIds for popup access
  const savedItemIdsRef = useRef<string[]>(savedItemIds);
  useEffect(() => {
    savedItemIdsRef.current = savedItemIds;
  }, [savedItemIds]);

  // Set up global function for popup "Add to Itinerary" buttons
  useEffect(() => {
    if (onAddToItinerary) {
      (window as any).addToItinerary = (id: string, name: string, type: string, description: string, address: string, price: string, lat: number, lng: number) => {
        onAddToItinerary({
          id,
          name,
          type: type as 'restaurant' | 'event' | 'landmark',
          description,
          address,
          price,
          coordinates: { lat, lng }
        });
      };
      // Also expose a function to check if item is saved
      (window as any).isItemSaved = (id: string) => savedItemIdsRef.current.includes(id);
    }
    return () => {
      delete (window as any).addToItinerary;
      delete (window as any).isItemSaved;
    };
  }, [onAddToItinerary]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [systemStress, setSystemStress] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isExpanded, setIsExpanded] = useState(false);
  const [internalActiveLayer, setInternalActiveLayer] = useState<LayerType>(null);

  // Use external activeLayer if provided, otherwise use internal state
  const activeLayer = externalActiveLayer !== undefined ? externalActiveLayer : internalActiveLayer;
  const setActiveLayer = (layer: LayerType) => {
    if (onActiveLayerChange) {
      onActiveLayerChange(layer);
    } else {
      setInternalActiveLayer(layer);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [is3DMode, setIs3DMode] = useState(true);
  const [activeSearchMarkers, setActiveSearchMarkers] = useState<mapboxgl.Marker[]>([]);

  // Derived state from activeLayer for compatibility
  const showPlaces = activeLayer === 'restaurants';
  const showTransitLayers = activeLayer === 'transit';
  const showEvents = activeLayer === 'events';
  const showLandmarks = activeLayer === 'landmarks';
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedItineraryDay, setSelectedItineraryDay] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showItinerary, setShowItinerary] = useState(false);

  // Generate vascular light trail segments with speed-linked pulse
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const generateLightTrails = useCallback((
    coordinates: [number, number][],
    routeColor: string,
    phase: number,
    speed: number,
    hasDelay: boolean = false
  ): GeoJSON.Feature[] => {
    const features: GeoJSON.Feature[] = [];
    const totalPoints = coordinates.length;
    if (totalPoints < 2) return features;

    // Speed-linked pulse: Formula from spec
    // 60 MPH = 0.02, 10 MPH = 0.005
    // pulseSpeed = 0.005 + (avgSpeed / 60) * 0.015
    const flowSpeed = 0.005 + (speed / 60) * 0.015;
    const adjustedFlowSpeed = 0.2 + flowSpeed * 40; // Scale for visual effect
    const adjustedPhase = (phase * adjustedFlowSpeed) % 1;

    // Get vascular color based on speed and delay status
    const colors = getVascularColor(speed, hasDelay);

    // Create multiple light pulses traveling along the track
    const numTrails = 3;
    const trailLength = 0.15; // 15% of track length for the trail

    for (let trail = 0; trail < numTrails; trail++) {
      const trailHead = (adjustedPhase + trail / numTrails) % 1;

      for (let i = 0; i < totalPoints - 1; i++) {
        const segmentStart = i / (totalPoints - 1);

        // Calculate how far this segment is from the trail head
        let distFromHead = segmentStart - trailHead;
        if (distFromHead < -0.5) distFromHead += 1;
        if (distFromHead > 0.5) distFromHead -= 1;

        // Only render segments within the trail length (behind the head)
        if (distFromHead >= -trailLength && distFromHead <= 0.02) {
          // Intensity falls off from head (brightest) to tail (fading)
          const trailPosition = 1 - Math.abs(distFromHead) / trailLength;
          const intensity = Math.pow(trailPosition, 1.5); // Exponential falloff for realistic motion blur

          // Head is white-hot, tail fades to route color
          const segmentColor = intensity > 0.8
            ? colors.core
            : intensity > 0.4
              ? lerpColor(colors.trail, colors.core, intensity)
              : lerpColor(routeColor, colors.trail, intensity * 2);

          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [coordinates[i], coordinates[i + 1]],
            },
            properties: {
              color: segmentColor,
              glowColor: colors.glow,
              intensity: 0.3 + intensity * 0.7,
              width: 2 + intensity * 6,
              blur: 1 + (1 - intensity) * 4,
              isHead: intensity > 0.9,
            },
          });
        }
      }
    }

    return features;
  }, []);

  // Initialize Mapbox with photorealistic satellite style
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11', // Light 3D mode
      center: [-73.9855, 40.7580], // New York City (Times Square)
      zoom: 14,
      pitch: 60,
      bearing: -15,
      maxBounds: [[-74.3, 40.4], [-73.7, 40.95]], // NYC bounds
      antialias: true,
      maxPitch: 85,
    });

    console.log('[Map3D] Container Dimensions:',
      mapContainer.current.clientWidth,
      mapContainer.current.clientHeight
    );

    map.current = mapInstance;

    mapInstance.on('style.load', () => {
      // Load the 3D Subway Model - Absolute path from public root
      mapInstance.addModel('subway-model', '/models/subway.glb');

      // Add standard lighting for 3D models (needed for simple GLB visibility)
      if (!mapInstance.getLayer('sky')) {
        mapInstance.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 0.0],
            'sky-atmosphere-sun-intensity': 15
          }
        });
      }

      // ===========================================
      // STYLES
      // ===========================================
    });

    mapInstance.on('style.load', () => {
      // Load the 3D Subway Model
      mapInstance.addModel('subway-model', './models/subway.glb');
    });

    mapInstance.on('load', async () => {

      // ===========================================
      // INITIAL VIEW - Disabled auto-tour for better UX
      // ===========================================

      // Set initial view to show downtown Boston with visible markers
      // Set initial view to NYC (Times Square)
      setTimeout(() => {
        mapInstance.easeTo({
          center: NYC_CENTER,
          zoom: 14,
          pitch: 60,
          bearing: -15,
          duration: 1500
        });
        console.log('[Map] Initial view set to NYC');
      }, 500);

      // ===========================================
      // 3D BUILDINGS LAYER
      // ===========================================

      // Find the first symbol layer to place buildings below labels
      const layers = mapInstance.getStyle().layers;
      const labelLayerId = layers?.find(
        (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
      )?.id;

      // Add 3D buildings from Mapbox composite source
      mapInstance.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 12,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['get', 'height'],
            0, '#e0e0e0',
            50, '#c0c8d0',
            100, '#a8b4c0',
            200, '#90a0b0'
          ],
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 0,
            12.5, ['get', 'height']
          ],
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 0,
            12.5, ['get', 'min_height']
          ],
          'fill-extrusion-opacity': 0.85
        }
      }, labelLayerId);

      console.log('[Map] 3D buildings layer added');

      // ===========================================
      // NYC SUBWAY ROUTES ("Vascular Transit")
      // ===========================================

      // Add NYC subway routes source
      mapInstance.addSource('nyc-routes', {
        type: 'geojson',
        data: nycRoutes as GeoJSON.FeatureCollection
      });

      // Main route lines with actual MTA colors
      mapInstance.addLayer({
        id: 'nyc-routes-line',
        type: 'line',
        source: 'nyc-routes',
        paint: {
          'line-color': ['coalesce', ['get', 'displayColor'], '#00E5FF'], // Default to Cyan
          'line-width': 4,
          'line-opacity': 0.9
        }
      });

      // Glow effect for routes
      mapInstance.addLayer({
        id: 'nyc-routes-glow',
        type: 'line',
        source: 'nyc-routes',
        paint: {
          'line-color': ['coalesce', ['get', 'displayColor'], '#00E5FF'], // Default to Cyan
          'line-width': 12,
          'line-opacity': 0.3,
          'line-blur': 6
        }
      }, 'nyc-routes-line');

      // ===========================================
      // NYC SUBWAY STATIONS
      // ===========================================

      // Add NYC stations source
      mapInstance.addSource('nyc-stations', {
        type: 'geojson',
        data: nycStations as GeoJSON.FeatureCollection
      });

      // Station circles
      mapInstance.addLayer({
        id: 'nyc-stations-circle',
        type: 'circle',
        source: 'nyc-stations',
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#00f3ff'
        }
      });

      // Station glow
      mapInstance.addLayer({
        id: 'nyc-stations-glow',
        type: 'circle',
        source: 'nyc-stations',
        paint: {
          'circle-radius': 12,
          'circle-color': '#00f3ff',
          'circle-opacity': 0.3,
          'circle-blur': 1
        }
      }, 'nyc-stations-circle');

      // Station labels
      mapInstance.addLayer({
        id: 'nyc-stations-label',
        type: 'symbol',
        source: 'nyc-stations',
        layout: {
          'text-field': ['get', 'stop_name'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-optional': true
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0, 0, 0, 0.8)',
          'text-halo-width': 1
        },
        minzoom: 13
      });

      console.log('[Map] NYC subway routes and stations added');

      // ===========================================
      // NYC SUBWAY TRAINS (Live Animated)
      // ===========================================

      // Add train vehicles source
      mapInstance.addSource('nyc-trains', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Train 3D Model
      // Load the model (safely)
      try {
        mapInstance.addModel('subway-model', '/models/subway.glb');
      } catch (e) {
        // Model might already be loaded or method not supported
        console.warn('Could not add subway model', e);
      }

      // 3D Model Layer
      mapInstance.addLayer({
        id: 'nyc-trains-model',
        type: 'model',
        source: 'nyc-trains',
        layout: {
          'model-id': 'subway-model'
        },
        paint: {
          'model-scale': [45, 45, 45], // Smaller trains
          'model-rotation': [0, 0, ['get', 'bearing']], // Align with train movement
          'model-translation': [0, 0, 0],
          'model-opacity': 1,
          'model-color-mix-intensity': 1,
          'model-color': ['get', 'color'] // Use original route color (don't change with status)
        }
      });

      // Simple glow effect (keep as circle for performance/visibility)
      mapInstance.addLayer({
        id: 'nyc-trains-glow',
        type: 'circle',
        source: 'nyc-trains',
        paint: {
          'circle-radius': 20,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.6,
          'circle-blur': 1,
          'circle-pitch-alignment': 'map'
        }
      });

      // Train route label
      mapInstance.addLayer({
        id: 'nyc-trains-label',
        type: 'symbol',
        source: 'nyc-trains',
        layout: {
          'text-field': ['get', 'routeId'],
          'text-size': 10,
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#ffffff'
        }
      });

      console.log('[Map] NYC train vehicles layer added');

      // Tooltip for subway status
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'subway-tooltip',
        maxWidth: '300px'
      });

      mapInstance.on('mouseenter', 'nyc-routes-line', (e) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        if (!props) return;

        mapInstance.getCanvas().style.cursor = 'pointer';

        const status = (props.status || 'NORMAL').toUpperCase();
        const reason = props.statusReason || (status === 'NORMAL' ? 'Good Service' : 'Delays Reported');
        const color = props.displayColor || '#00f3ff';
        const lineName = props.name || `${props.route_id} Line`;

        const html = `
          <div style="padding: 4px;">
            <strong style="display:block; font-size: 14px; margin-bottom: 4px;">${lineName}</strong>
            <div style="font-size: 12px; font-weight: bold; color: ${color}; margin-bottom: 2px;">${status}</div>
            <div style="font-size: 11px; opacity: 0.9;">${reason}</div>
          </div>
        `;

        popup.setLngLat(e.lngLat).setHTML(html).addTo(mapInstance);
      });

      mapInstance.on('mouseleave', 'nyc-routes-line', () => {
        mapInstance.getCanvas().style.cursor = '';
        popup.remove();
      });

      // Click to see details (sticky)
      mapInstance.on('click', 'nyc-routes-line', (e) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        if (!props) return;

        const status = (props.status || 'NORMAL').toUpperCase();
        const reason = props.statusReason || (status === 'NORMAL' ? 'Good Service' : 'Delays Reported');
        const color = props.displayColor || '#00f3ff';
        const lineName = props.name || `${props.route_id} Line`;

        new mapboxgl.Popup({ className: 'subway-detail-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="padding: 8px; min-width: 150px;">
              <h3 style="margin:0 0 5px 0; color: ${color}; border-bottom: 1px solid #333; padding-bottom: 3px;">${lineName}</h3>
              <div style="font-weight: bold; margin-bottom: 4px;">Status: ${status}</div>
              <div style="font-size: 13px; opacity: 0.9;">${reason}</div>
            </div>
          `)
          .addTo(mapInstance);
      });

      // ===========================================
      // 3D HUMAN MODEL - Live Location Marker
      // ===========================================

      // NYC Times Square as default location
      const humanLocation: [number, number] = [-73.9857, 40.7484];

      mapInstance.addSource('human-location', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: humanLocation
            },
            properties: {
              bearing: 0 // Can be updated for rotation
            }
          }]
        }
      });

      // ===========================================
      // PLACE MARKERS
      // ===========================================

      mapInstance.addSource('places', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Place glow (rating-based color) - ENHANCED VISIBILITY
      mapInstance.addLayer({
        id: 'places-glow',
        type: 'circle',
        source: 'places',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 14, 16, 20],
          'circle-color': ['get', 'markerColor'],
          'circle-blur': 0.8,
          'circle-opacity': 0.6,
        },
        minzoom: 10,
      });

      // Place marker - ENHANCED VISIBILITY
      mapInstance.addLayer({
        id: 'places-marker',
        type: 'circle',
        source: 'places',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6, 16, 10],
          'circle-color': ['get', 'markerColor'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
        minzoom: 10,
      });

      // Place labels (show at higher zoom)
      mapInstance.addLayer({
        id: 'places-label',
        type: 'symbol',
        source: 'places',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-max-width': 12,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.5,
        },
        minzoom: 15,
      });

      // ===========================================
      // EVENT MARKERS (3D "E" Text)
      // ===========================================

      mapInstance.addSource('events', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Event glow - ENHANCED VISIBILITY (bright purple/magenta)
      mapInstance.addLayer({
        id: 'events-glow',
        type: 'circle',
        source: 'events',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 12, 14, 18, 16, 25],
          'circle-color': '#e879f9',
          'circle-blur': 0.8,
          'circle-opacity': 0.7,
        },
        minzoom: 10,
      });

      // Event "E" text marker - ENHANCED VISIBILITY
      mapInstance.addLayer({
        id: 'events-marker',
        type: 'symbol',
        source: 'events',
        layout: {
          'text-field': 'E',
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 16, 14, 24, 16, 32],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#a855f7',
          'text-halo-width': 3,
        },
        minzoom: 10,
      });

      // Event labels (show at higher zoom)
      mapInstance.addLayer({
        id: 'events-label',
        type: 'symbol',
        source: 'events',
        layout: {
          'text-field': ['get', 'title'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-offset': [0, 1.8],
          'text-anchor': 'top',
          'text-max-width': 12,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.5,
        },
        minzoom: 14,
      });

      // Event click interaction
      mapInstance.on('click', 'events-marker', (e) => {
        if (!e.features || e.features.length === 0) return;

        const props = e.features[0].properties;
        if (!props) return;
        const coordinates = (e.features[0].geometry as any).coordinates.slice();

        const startDate = formatEventDate(props.startTime);
        const startTime = formatEventTime(props.startTime);
        const endTime = formatEventTime(props.endTime);

        const photoUrl = props.photoName ?
          (props.photoName.startsWith('http') ? props.photoName :
            props.photoName.startsWith('places/') ?
              `https://places.googleapis.com/v1/${props.photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${GOOGLE_MAPS_API_KEY}` :
              `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${props.photoName}&key=${GOOGLE_MAPS_API_KEY}`) : '';

        const popupHTML = `
          <div class="event-popup" style="min-width: 300px; max-width: 340px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif; background: linear-gradient(to bottom, rgba(30,35,45,0.98), rgba(20,25,35,0.99)); backdrop-filter: blur(20px); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1);">
            
            ${photoUrl ? `<div style="width: 100%; height: 140px; background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); position: relative; overflow: hidden;">
              <img src="${photoUrl}" style="width: 100%; height: 100%; object-fit: cover;" 
                onerror="this.parentElement.style.background='linear-gradient(135deg, #ec4899 0%, #db2777 100%)';" />
              <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 50%, rgba(20,25,35,0.95) 100%);"></div>
            </div>` : `<div style="height: 60px; background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); position: relative;"><div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 30%, rgba(20,25,35,0.95) 100%);"></div></div>`}

            <div style="padding: 16px;">
              <div style="display: inline-block; padding: 5px 12px; background: rgba(236,72,153,0.2); color: #ec4899; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; border: 1px solid rgba(236,72,153,0.3);">
                <i class="fa-solid fa-star" style="margin-right: 4px;"></i> Event
              </div>
              
              <h3 style="margin: 0 0 14px 0; font-size: 18px; font-weight: 700; color: #fff; line-height: 1.3; letter-spacing: -0.3px;">
                ${props.title}
              </h3>
              
              <div style="margin: 14px 0; display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
                <i class="fa-solid fa-calendar" style="font-size: 16px; color: #f97316;"></i>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <span style="font-size: 14px; color: #fff; font-weight: 600;">${startDate}</span>
                  <span style="font-size: 12px; color: rgba(255,255,255,0.6); font-weight: 500;">${startTime} - ${endTime}</span>
                </div>
              </div>
              
              <div style="margin: 12px 0; display: flex; align-items: center; gap: 12px;">
                <i class="fa-solid fa-location-dot" style="font-size: 16px; color: #ec4899;"></i>
                <span style="font-size: 13px; color: rgba(255,255,255,0.8); font-weight: 500; line-height: 1.5;">${props.venueName}</span>
              </div>
              
              ${props.description ? `<div style="margin: 14px 0; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 10px; border-left: 3px solid #f97316;">
                <div style="font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.6; font-weight: 400;">
                  ${props.description}
                </div>
              </div>` : ''}
              
              ${props.price && props.price !== 'Free' ? `<div style="margin: 12px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px;">Price:</span>
                <span style="font-size: 14px; color: #f97316; font-weight: 700;">${props.price}</span>
              </div>` : props.price === 'Free' ? `<div style="margin: 12px 0;">
                <span style="display: inline-block; padding: 5px 12px; background: rgba(34,197,94,0.2); color: #22c55e; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px; border: 1px solid rgba(34,197,94,0.3);">FREE EVENT</span>
              </div>` : ''}
              
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; gap: 10px;">
                <button 
                  onclick="window.addToItinerary && window.addToItinerary('${props.id}', '${(props.title || '').replace(/'/g, "\\'")}', 'event', '${(props.description || '').replace(/'/g, "\\'")}', '${(props.venueName || '').replace(/'/g, "\\'")}', '${props.price || ''}', ${coordinates[1]}, ${coordinates[0]})"
                  style="flex: 1; text-align: center; padding: 12px 16px; background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;"
                  ${savedItemIdsRef.current.includes(props.id) ? 'disabled style="flex: 1; text-align: center; padding: 12px 16px; background: #22c55e; color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: default;"' : ''}
                >
                  ${savedItemIdsRef.current.includes(props.id) ? '✓ Added' : '+ Add to Itinerary'}
                </button>
                ${props.sourceUrl ? `<a href="${props.sourceUrl}" target="_blank" style="padding: 12px 16px; background: rgba(255,255,255,0.1); color: #fff; text-decoration: none; border-radius: 10px; font-size: 13px; font-weight: 600; border: 1px solid rgba(255,255,255,0.15);">
                  Details
                </a>` : ''}
              </div>
            </div>
          </div>
        `;

        new mapboxgl.Popup({ maxWidth: '360px', className: 'dark-popup' })
          .setLngLat(coordinates)
          .setHTML(popupHTML)
          .addTo(mapInstance);
      });

      // Cursor change on event hover
      mapInstance.on('mouseenter', 'events-marker', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });

      mapInstance.on('mouseleave', 'events-marker', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

      // ===========================================
      // LANDMARK MARKERS (Purple icons)
      // ===========================================

      mapInstance.addSource('landmarks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Landmark glow - purple/violet theme
      mapInstance.addLayer({
        id: 'landmarks-glow',
        type: 'circle',
        source: 'landmarks',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 12, 14, 18, 16, 25],
          'circle-color': '#a855f7',
          'circle-blur': 0.8,
          'circle-opacity': 0.7,
        },
        minzoom: 10,
      });

      // Landmark "L" text marker
      mapInstance.addLayer({
        id: 'landmarks-marker',
        type: 'symbol',
        source: 'landmarks',
        layout: {
          'text-field': 'L',
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 16, 14, 24, 16, 32],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#8b5cf6',
          'text-halo-width': 3,
        },
        minzoom: 10,
      });

      // Landmark labels
      mapInstance.addLayer({
        id: 'landmarks-label',
        type: 'symbol',
        source: 'landmarks',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-max-width': 12,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.5,
        },
        minzoom: 14,
      });

      // ===========================================
      // ITINERARY ROUTE VISUALIZATION
      // ===========================================

      // Source for itinerary routes (walking and transit paths)
      mapInstance.addSource('itinerary-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Source for itinerary stop markers
      mapInstance.addSource('itinerary-stops', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // ===========================================
      // WALKING PATHS - Modern gradient dashed line
      // ===========================================
      
      // Walking outer glow (soft orange ambient)
      mapInstance.addLayer({
        id: 'itinerary-walking-glow',
        type: 'line',
        source: 'itinerary-routes',
        filter: ['==', ['get', 'mode'], 'walking'],
        layout: {
          'visibility': 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#f97316',
          'line-width': 20,
          'line-blur': 12,
          'line-opacity': 0.3,
        },
      });

      // Walking main line (sleek dotted pattern)
      mapInstance.addLayer({
        id: 'itinerary-walking',
        type: 'line',
        source: 'itinerary-routes',
        filter: ['==', ['get', 'mode'], 'walking'],
        layout: {
          'visibility': 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#f97316',
          'line-width': 5,
          'line-dasharray': [0, 2],
          'line-opacity': 1,
        },
      });

      // ===========================================
      // TRANSIT PATHS - Premium subway-style lines
      // ===========================================
      
      // Transit outer glow (dynamic color)
      mapInstance.addLayer({
        id: 'itinerary-transit-glow',
        type: 'line',
        source: 'itinerary-routes',
        filter: ['==', ['get', 'mode'], 'transit'],
        layout: {
          'visibility': 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['coalesce', ['get', 'routeColor'], '#f97316'],
          'line-width': 24,
          'line-blur': 10,
          'line-opacity': 0.4,
        },
      });

      // Transit border (dark outline)
      mapInstance.addLayer({
        id: 'itinerary-transit-border',
        type: 'line',
        source: 'itinerary-routes',
        filter: ['==', ['get', 'mode'], 'transit'],
        layout: {
          'visibility': 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#1a1a2e',
          'line-width': 10,
          'line-opacity': 1,
        },
      });

      // Transit main line (subway color)
      mapInstance.addLayer({
        id: 'itinerary-transit',
        type: 'line',
        source: 'itinerary-routes',
        filter: ['==', ['get', 'mode'], 'transit'],
        layout: {
          'visibility': 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['coalesce', ['get', 'routeColor'], '#f97316'],
          'line-width': 6,
          'line-opacity': 1,
        },
      });

      // Transit center highlight (white shine)
      mapInstance.addLayer({
        id: 'itinerary-transit-center',
        type: 'line',
        source: 'itinerary-routes',
        filter: ['==', ['get', 'mode'], 'transit'],
        layout: {
          'visibility': 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.5,
          'line-opacity': 0.4,
        },
      });

      // ===========================================
      // ITINERARY STOP MARKERS - Clean Modern Pin Style
      // ===========================================

      // Drop shadow
      mapInstance.addLayer({
        id: 'itinerary-stops-glow',
        type: 'circle',
        source: 'itinerary-stops',
        layout: {
          'visibility': 'none',
        },
        paint: {
          'circle-radius': 16,
          'circle-color': '#000000',
          'circle-blur': 0.8,
          'circle-opacity': 0.25,
          'circle-translate': [0, 3],
        },
      });

      // White background circle
      mapInstance.addLayer({
        id: 'itinerary-stops-circle',
        type: 'circle',
        source: 'itinerary-stops',
        layout: {
          'visibility': 'none',
        },
        paint: {
          'circle-radius': 18,
          'circle-color': '#ffffff',
          'circle-stroke-color': [
            'match',
            ['get', 'type'],
            'hotel', '#f97316',    // Orange for start
            'meal', '#ef4444',     // Red for food
            'activity', '#3b82f6', // Blue for activities
            'visit', '#8b5cf6',    // Purple for landmarks
            '#f97316'
          ],
          'circle-stroke-width': 3,
          'circle-opacity': 1,
        },
      });

      // Inner colored circle
      mapInstance.addLayer({
        id: 'itinerary-stops-highlight',
        type: 'circle',
        source: 'itinerary-stops',
        layout: {
          'visibility': 'none',
        },
        paint: {
          'circle-radius': 12,
          'circle-color': [
            'match',
            ['get', 'type'],
            'hotel', '#f97316',    // Orange for start
            'meal', '#ef4444',     // Red for food
            'activity', '#3b82f6', // Blue for activities
            'visit', '#8b5cf6',    // Purple for landmarks
            '#f97316'
          ],
          'circle-opacity': 1,
        },
      });

      // Number in center
      mapInstance.addLayer({
        id: 'itinerary-stops-icon',
        type: 'symbol',
        source: 'itinerary-stops',
        layout: {
          'visibility': 'none',
          'text-field': ['get', 'order'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 14,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // Hidden - not used but needed for layer management
      mapInstance.addLayer({
        id: 'itinerary-stops-number-bg',
        type: 'circle',
        source: 'itinerary-stops',
        layout: {
          'visibility': 'none',
        },
        paint: {
          'circle-radius': 0,
          'circle-opacity': 0,
        },
      });

      // Hidden - not used but needed for layer management
      mapInstance.addLayer({
        id: 'itinerary-stops-number',
        type: 'symbol',
        source: 'itinerary-stops',
        layout: {
          'visibility': 'none',
          'text-field': '',
        },
        paint: {
          'text-opacity': 0,
        },
      });

      // Stop labels with name - below pin
      mapInstance.addLayer({
        id: 'itinerary-stops-label',
        type: 'symbol',
        source: 'itinerary-stops',
        layout: {
          'visibility': 'none',
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-offset': [0, 1.8],
          'text-anchor': 'top',
          'text-max-width': 10,
        },
        paint: {
          'text-color': '#1a1a1a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        },
        minzoom: 10,
      });

      // ================================================
      // ITINERARY STOP CLICK HANDLER
      // ================================================
      mapInstance.on('click', 'itinerary-stops-circle', async (e) => {
        if (!e.features || e.features.length === 0) return;

        const props = e.features[0].properties;
        if (!props) return;
        const coordinates = (e.features[0].geometry as any).coordinates.slice();

        // Get stop details
        const stopName = props.name || 'Stop';
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _stopTime = props.time || '';
        const stopType = props.type || 'visit';
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _stopNumber = props.stopNumber || '';

        // Determine icon and color based on type
        let typeIcon = '📍';
        let typeColor = '#8b5cf6';
        let typeLabel = 'Visit';

        if (stopType === 'hotel') {
          typeIcon = '🏨';
          typeColor = '#f59e0b';
          typeLabel = 'Hotel';
        } else if (stopType === 'meal') {
          typeIcon = '🍽️';
          typeColor = '#f97316';
          typeLabel = 'Meal';
        } else if (stopType === 'activity') {
          typeIcon = '🎯';
          typeColor = '#3b82f6';
          typeLabel = 'Activity';
        }

        // Get photo and details from stop properties (populated from original items)
        let photoUrl = '';
        let placeRating = props.rating || 0;
        let placeAddress = props.address || '';
        let placeCategories = props.categories || '';

        // Extract place name from description (remove "Visit ", "Lunch at ", etc.)
        const cleanName = stopName
          .replace(/^(visit|lunch at|dinner at|breakfast at|arrive at|leave|return to|walk to|exploring|enjoying|checking in at|checking out from|leaving|starting the day from|visiting)\s+/i, '')
          .trim();

        // Use photo from stop properties if available
        if (props.photoName) {
          photoUrl = props.photoName.startsWith('http') ? props.photoName :
            props.photoName.startsWith('places/') ?
              `https://places.googleapis.com/v1/${props.photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${GOOGLE_MAPS_API_KEY}` :
              `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${props.photoName}&key=${GOOGLE_MAPS_API_KEY}`;
        }

        // If no photo from properties, try to find from places source
        if (!photoUrl) {
          try {
            const features = mapInstance.querySourceFeatures('places');
            const matchingPlace = features.find((f: any) => {
              const placeName = (f.properties?.name || '').toLowerCase();
              const searchName = cleanName.toLowerCase();
              return placeName.includes(searchName) || searchName.includes(placeName) ||
                placeName.split(' ').some((word: string) => searchName.includes(word) && word.length > 3);
            });

            if (matchingPlace?.properties) {
              const p = matchingPlace.properties;
              if (!placeRating) placeRating = p.rating || 0;
              if (!placeAddress) placeAddress = p.address || '';
              if (!placeCategories) placeCategories = p.categories || '';

              if (p.photoName) {
                photoUrl = p.photoName.startsWith('http') ? p.photoName :
                  p.photoName.startsWith('places/') ?
                    `https://places.googleapis.com/v1/${p.photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${GOOGLE_MAPS_API_KEY}` :
                    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photoName}&key=${GOOGLE_MAPS_API_KEY}`;
              }
            }
          } catch {
            console.log('[Itinerary] Could not find matching place for:', cleanName);
          }
        }

        // Build popup HTML - Dark glassmorphic style matching sidebar
        const popupHTML = `
          <div class="map-popup-card" style="width: 280px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(to bottom, rgba(51,65,85,0.95), rgba(30,41,59,0.98)); backdrop-filter: blur(20px); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1);">
            ${photoUrl ? `
              <div style="height: 120px; background: url('${photoUrl}') center/cover no-repeat; position: relative;">
                <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 50%, rgba(30,41,59,0.9) 100%);"></div>
                <div style="position: absolute; top: 10px; left: 10px; background: ${typeColor}; color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${typeLabel}
                </div>
              </div>
            ` : ''}
            
            <div style="padding: 14px 16px;">
              <!-- Type badge if no photo -->
              ${!photoUrl ? `
                <div style="display: inline-flex; align-items: center; gap: 6px; background: ${typeColor}; color: #fff; padding: 5px 10px; border-radius: 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
                  ${typeIcon} ${typeLabel}
                </div>
              ` : ''}
              
              <h3 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #fff; line-height: 1.3;">
                ${cleanName}
              </h3>
              
              ${placeCategories ? `
                <p style="margin: 0 0 10px 0; font-size: 11px; color: rgba(255,255,255,0.5);">
                  ${placeCategories}
                </p>
              ` : ''}
              
              ${placeRating > 0 ? `
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 12px;">
                  <div style="display: flex; gap: 2px;">
                    ${Array(5).fill(0).map((_, i) => `<span style="color: ${i < Math.floor(placeRating) ? '#fbbf24' : 'rgba(255,255,255,0.2)'}; font-size: 11px;">★</span>`).join('')}
                  </div>
                  <span style="font-size: 12px; font-weight: 600; color: #fff;">${placeRating.toFixed(1)}</span>
                </div>
              ` : ''}
              
              ${placeAddress ? `
                <div style="display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; background: rgba(255,255,255,0.05); border-radius: 10px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.08);">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  <span style="font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1.4;">${placeAddress}</span>
                </div>
              ` : ''}
              
              <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(placeAddress || cleanName)}', '_blank')" style="width: 100%; padding: 11px; background: #f97316; border: none; border-radius: 10px; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 8px rgba(249,115,22,0.3);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                </svg>
                Get Directions
              </button>
            </div>
          </div>
        `;

        new mapboxgl.Popup({
          maxWidth: '300px',
          className: 'dark-popup',
          closeButton: true,
          closeOnClick: true,
          offset: 30
        })
          .setLngLat(coordinates)
          .setHTML(popupHTML)
          .addTo(mapInstance);
      });

      // Cursor change on itinerary stop hover
      mapInstance.on('mouseenter', 'itinerary-stops-circle', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });

      mapInstance.on('mouseleave', 'itinerary-stops-circle', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

      // Landmark click interaction - with dynamic photo fetching
      mapInstance.on('click', 'landmarks-marker', async (e) => {
        if (!e.features || e.features.length === 0) return;

        const props = e.features[0].properties;
        if (!props) return;
        const coordinates = (e.features[0].geometry as any).coordinates.slice();
        const [lng, lat] = coordinates;

        // Show loading popup first
        const loadingPopup = new mapboxgl.Popup({ maxWidth: '320px', className: 'landmark-popup-container' })
          .setLngLat(coordinates)
          .setHTML(`
            <div class="landmark-popup" style="padding: 20px; text-align: center;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 700; color: #000;">${props.name}</h3>
              <div style="color: #666;">Loading details...</div>
            </div>
          `)
          .addTo(mapInstance);

        // Try to fetch photo from Google Places API
        let photoUrl = '';
        let googleRating = 0;
        let googleAddress = '';

        if (!props.photoName) {
          try {
            const response = await fetch(
              `${API_BASE_URL}/api/places/photo?name=${encodeURIComponent(props.name)}&lat=${lat}&lng=${lng}`
            );
            const data = await response.json();
            if (data.photoUrl) {
              photoUrl = data.photoUrl;
              googleRating = data.rating || 0;
              googleAddress = data.formattedAddress || '';
            }
          } catch (error) {
            console.error('Error fetching landmark photo:', error);
          }
        } else {
          // Use existing photo reference
          photoUrl = props.photoName.startsWith('http') ? props.photoName :
            props.photoName.startsWith('places/') ?
              `https://places.googleapis.com/v1/${props.photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${GOOGLE_MAPS_API_KEY}` :
              `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${props.photoName}&key=${GOOGLE_MAPS_API_KEY}`;
        }

        // Build rating
        const rating = googleRating || 0;
        
        // Address line
        const address = googleAddress || (props.neighborhood ? `${props.neighborhood}, ${props.borough}` : props.borough || 'NYC');

        // Description
        const description = props.description || '';

        // Build popup HTML - Dark UI matching theme
        const popupHTML = `
          <div class="landmark-popup" style="min-width: 300px; max-width: 340px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif; background: linear-gradient(to bottom, rgba(30,35,45,0.98), rgba(20,25,35,0.99)); backdrop-filter: blur(20px); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1);">
            
            ${photoUrl ? `<div style="width: 100%; height: 140px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); position: relative; overflow: hidden;">
              <img src="${photoUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';" />
              <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 50%, rgba(20,25,35,0.95) 100%);"></div>
              ${rating > 0 ? `<div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); padding: 5px 10px; border-radius: 8px; font-size: 12px; color: #fff; font-weight: 600; border: 1px solid rgba(255,255,255,0.1);">
                <i class="fa-solid fa-star" style="color: #fbbf24; margin-right: 4px;"></i>${rating.toFixed(1)}
              </div>` : ''}
            </div>` : `<div style="height: 60px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); position: relative;"><div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 30%, rgba(20,25,35,0.95) 100%);"></div></div>`}
            
            <div style="padding: 16px;">
              <div style="display: inline-block; padding: 5px 12px; background: rgba(139,92,246,0.2); color: #a78bfa; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px; border: 1px solid rgba(139,92,246,0.3);">
                <i class="fa-solid fa-camera" style="margin-right: 4px;"></i> ${props.category || 'Landmark'}
              </div>
              
              <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #fff; line-height: 1.3;">
                ${props.name}
              </h3>
              
              <div style="margin: 12px 0; display: flex; align-items: center; gap: 10px;">
                <i class="fa-solid fa-location-dot" style="font-size: 14px; color: #8b5cf6;"></i>
                <span style="font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 500; line-height: 1.4;">${address}</span>
              </div>
              
              ${description ? `
                <div style="margin: 12px 0; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 10px; border-left: 3px solid #8b5cf6;">
                  <div style="font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.6;">
                    ${description}
                  </div>
                </div>
              ` : ''}
              
              ${props.bestTime ? `
                <div style="margin: 10px 0; display: flex; align-items: center; gap: 8px;">
                  <i class="fa-solid fa-clock" style="font-size: 12px; color: #f97316;"></i>
                  <span style="font-size: 12px; color: rgba(255,255,255,0.6);"><strong style="color: rgba(255,255,255,0.8);">Best time:</strong> ${props.bestTime}</span>
                </div>
              ` : ''}
              
              ${props.proTip ? `
                <div style="margin: 12px 0; padding: 10px 12px; background: rgba(251,191,36,0.15); border-radius: 8px; font-size: 12px; color: #fbbf24; border: 1px solid rgba(251,191,36,0.3);">
                  <i class="fa-solid fa-lightbulb" style="margin-right: 6px;"></i> <strong>Pro tip:</strong> ${props.proTip}
                </div>
              ` : ''}
              
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                <button 
                  onclick="window.addToItinerary && window.addToItinerary('${props.id}', '${(props.name || '').replace(/'/g, "\\'")}', 'landmark', '${(description || '').replace(/'/g, "\\'")}', '${(address || '').replace(/'/g, "\\'")}', '', ${lat}, ${lng})"
                  style="width: 100%; text-align: center; padding: 12px 14px; background: ${savedItemIdsRef.current.includes(props.id) ? '#22c55e' : 'linear-gradient(135deg, #f97316, #ea580c)'}; color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: ${savedItemIdsRef.current.includes(props.id) ? 'default' : 'pointer'}; transition: all 0.2s; margin-bottom: 10px;"
                  ${savedItemIdsRef.current.includes(props.id) ? 'disabled' : ''}
                >
                  ${savedItemIdsRef.current.includes(props.id) ? '✓ Added to Itinerary' : '+ Add to Itinerary'}
                </button>
                <div style="display: flex; gap: 8px;">
                  <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.name + ' ' + address)}" 
                     target="_blank" 
                     style="flex: 1; text-align: center; padding: 10px 14px; background: rgba(255,255,255,0.1); color: #fff; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 600; border: 1px solid rgba(255,255,255,0.15);">
                    <i class="fa-solid fa-diamond-turn-right" style="margin-right: 4px;"></i> Directions
                  </a>
                  <a href="https://www.google.com/search?q=${encodeURIComponent(props.name + ' NYC landmark')}" 
                     target="_blank" 
                     style="flex: 1; text-align: center; padding: 10px 14px; background: rgba(139,92,246,0.2); color: #a78bfa; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 600; border: 1px solid rgba(139,92,246,0.3);">
                    <i class="fa-solid fa-circle-info" style="margin-right: 4px;"></i> Learn More
                  </a>
                </div>
              </div>
            </div>
          </div>
        `;

        // Remove loading popup and show final popup
        loadingPopup.remove();

        new mapboxgl.Popup({ maxWidth: '360px', className: 'dark-popup' })
          .setLngLat(coordinates)
          .setHTML(popupHTML)
          .addTo(mapInstance);
      });

      // Cursor change on landmark hover
      mapInstance.on('mouseenter', 'landmarks-marker', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });

      mapInstance.on('mouseleave', 'landmarks-marker', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

      // Place click interaction - with dynamic photo fetching
      mapInstance.on('click', 'places-marker', async (e) => {
        if (!e.features || e.features.length === 0) return;

        const props = e.features[0].properties;
        if (!props) return;
        const coordinates = (e.features[0].geometry as any).coordinates.slice();
        const [lng, lat] = coordinates;

        // Show loading popup first
        const loadingPopup = new mapboxgl.Popup({ maxWidth: '340px', className: 'place-popup-container' })
          .setLngLat(coordinates)
          .setHTML(`
            <div class="place-popup" style="padding: 20px; text-align: center;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 700; color: #000;">${props.name}</h3>
              <div style="color: #666;">Loading details...</div>
            </div>
          `)
          .addTo(mapInstance);

        // Try to fetch photo from Google Places API
        let photoUrl = '';
        let googleRating = 0;
        let googleAddress = '';

        if (!props.photoName) {
          try {
            const response = await fetch(
              `${API_BASE_URL}/api/places/photo?name=${encodeURIComponent(props.name)}&lat=${lat}&lng=${lng}`
            );
            const data = await response.json();
            if (data.photoUrl) {
              photoUrl = data.photoUrl;
              googleRating = data.rating || 0;
              googleAddress = data.formattedAddress || '';
            }
          } catch (error) {
            console.error('Error fetching place photo:', error);
          }
        } else {
          // Use existing photo reference
          photoUrl = props.photoName.startsWith('http') ? props.photoName :
            props.photoName.startsWith('places/') ?
              `https://places.googleapis.com/v1/${props.photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${GOOGLE_MAPS_API_KEY}` :
              `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${props.photoName}&key=${GOOGLE_MAPS_API_KEY}`;
        }

        // Use Google rating if available, otherwise use popularity score converted to 5-star scale
        const rating = googleRating || (props.popularity ? (props.popularity / 100) * 5 : 0);

        // Address line
        const address = googleAddress || (props.neighborhood ? `${props.neighborhood}, ${props.borough}` : props.borough || 'NYC');

        // Description
        const description = props.description || '';

        // Build popup HTML - Dark UI matching theme
        const priceRange = props.priceRange || '';
        const cuisine = props.cuisine || '';
        const tags = props.tags ? props.tags.split(',').map((t: string) => t.trim()).slice(0, 4) : [];
        
        const popupHTML = `
          <div class="place-popup" style="min-width: 300px; max-width: 340px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif; background: linear-gradient(to bottom, rgba(30,35,45,0.98), rgba(20,25,35,0.99)); backdrop-filter: blur(20px); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1);">
            
            ${photoUrl ? `<div style="width: 100%; height: 140px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); position: relative; overflow: hidden;">
              <img src="${photoUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';" />
              <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 50%, rgba(20,25,35,0.95) 100%);"></div>
              <div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); padding: 5px 10px; border-radius: 8px; font-size: 12px; color: #fff; font-weight: 600; border: 1px solid rgba(255,255,255,0.1);">
                <i class="fa-solid fa-star" style="color: #fbbf24; margin-right: 4px;"></i>${rating > 0 ? rating.toFixed(1) : 'New'}
              </div>
              ${priceRange ? `<div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); padding: 5px 10px; border-radius: 8px; font-size: 12px; color: #22c55e; font-weight: 700; border: 1px solid rgba(255,255,255,0.1);">${priceRange}</div>` : ''}
            </div>` : `<div style="height: 60px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); position: relative;"><div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 30%, rgba(20,25,35,0.95) 100%);"></div></div>`}
            
            <div style="padding: 16px;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 700; color: #fff; line-height: 1.3; letter-spacing: -0.3px;">
                ${props.name}
              </h3>
              
              <div style="margin: 10px 0; display: flex; align-items: center; gap: 10px;">
                <i class="fa-solid fa-location-dot" style="font-size: 14px; color: #f97316;"></i>
                <span style="font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 500; line-height: 1.4;">${address}</span>
              </div>
              
              ${description ? `
                <div style="margin: 12px 0; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 10px; border-left: 3px solid #f97316;">
                  <div style="font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.6; font-style: italic;">
                    "${description}"
                  </div>
                </div>
              ` : ''}
              
              ${cuisine || tags.length > 0 ? `
                <div style="margin: 12px 0; display: flex; flex-wrap: wrap; gap: 6px;">
                  ${cuisine ? `<span style="display: inline-block; padding: 5px 10px; background: rgba(249,115,22,0.2); color: #f97316; border-radius: 6px; font-size: 11px; font-weight: 600; border: 1px solid rgba(249,115,22,0.3);">${cuisine}</span>` : ''}
                  ${tags.map((tag: string) => `<span style="display: inline-block; padding: 5px 10px; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); border-radius: 6px; font-size: 11px; font-weight: 500; border: 1px solid rgba(255,255,255,0.1);">${tag}</span>`).join('')}
                </div>
              ` : ''}
              
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                <button 
                  onclick="window.addToItinerary && window.addToItinerary('${props.id}', '${(props.name || '').replace(/'/g, "\\'")}', 'restaurant', '${(description || '').replace(/'/g, "\\'")}', '${(address || '').replace(/'/g, "\\'")}', '${priceRange}', ${lat}, ${lng})"
                  style="width: 100%; text-align: center; padding: 12px 14px; background: ${savedItemIdsRef.current.includes(props.id) ? '#22c55e' : 'linear-gradient(135deg, #f97316, #ea580c)'}; color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: ${savedItemIdsRef.current.includes(props.id) ? 'default' : 'pointer'}; transition: all 0.2s; margin-bottom: 10px;"
                  ${savedItemIdsRef.current.includes(props.id) ? 'disabled' : ''}
                >
                  ${savedItemIdsRef.current.includes(props.id) ? '✓ Added to Itinerary' : '+ Add to Itinerary'}
                </button>
                <div style="display: flex; gap: 8px;">
                  <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.name + ' ' + address)}" 
                     target="_blank" 
                     style="flex: 1; text-align: center; padding: 10px 14px; background: rgba(255,255,255,0.1); color: #fff; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 600; border: 1px solid rgba(255,255,255,0.15);">
                    <i class="fa-solid fa-diamond-turn-right" style="margin-right: 4px;"></i> Directions
                  </a>
                  <a href="https://www.google.com/search?q=${encodeURIComponent(props.name + ' NYC')}" 
                     target="_blank" 
                     style="flex: 1; text-align: center; padding: 10px 14px; background: rgba(249,115,22,0.2); color: #f97316; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 600; border: 1px solid rgba(249,115,22,0.3);">
                    <i class="fa-solid fa-circle-info" style="margin-right: 4px;"></i> More Info
                  </a>
                </div>
              </div>
            </div>
          </div>
        `;

        // Remove loading popup and show final popup
        loadingPopup.remove();

        new mapboxgl.Popup({ maxWidth: '360px', className: 'dark-popup' })
          .setLngLat(coordinates)
          .setHTML(popupHTML)
          .addTo(mapInstance);
      });

      // Cursor change on place hover
      mapInstance.on('mouseenter', 'places-marker', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });

      mapInstance.on('mouseleave', 'places-marker', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

      // ===========================================
      // BUILDING CLICK INTERACTION - DISABLED
      // Building selection has been turned off
      /*
      mapInstance.on('click', 'buildings-3d', (e) => {
        if (!e.features || e.features.length === 0) return;

        const feature = e.features[0];
        const buildingId = feature.id?.toString() || '';

        // Toggle selection
        if (selectedBuildingRef.current === buildingId) {
          selectedBuildingRef.current = null;
          // Reset to pure black and normal height
          mapInstance.setPaintProperty('buildings-3d', 'fill-extrusion-color', '#000000');
          mapInstance.setPaintProperty('buildings-3d', 'fill-extrusion-height', ['get', 'height']);
          mapInstance.setPaintProperty('buildings-3d', 'fill-extrusion-flood-light-intensity', 0.1);
        } else {
          selectedBuildingRef.current = buildingId;

          // X-RAY LIFT: Physically lift building 50 meters
          mapInstance.setPaintProperty('buildings-3d', 'fill-extrusion-height', [
            'case',
            ['==', ['id'], feature.id],
            ['+', ['coalesce', ['get', 'height'], 30], 50], // Lift 50m
            ['coalesce', ['get', 'height'], 30]
          ]);

          // Highlight selected building with vascular cyan
          mapInstance.setPaintProperty('buildings-3d', 'fill-extrusion-color', [
            'case',
            ['==', ['id'], feature.id],
            VASCULAR_COLORS.healthyCyan, // Electric Cyan highlight
            '#000000' // Pure black for others
          ]);

          // UNDER-GLOW: Apply flood light based on sentiment
          // For now, use cyan (positive) - can be linked to Reddit sentiment later
          mapInstance.setPaintProperty('buildings-3d', 'fill-extrusion-flood-light-color', VASCULAR_COLORS.positive);
          mapInstance.setPaintProperty('buildings-3d', 'fill-extrusion-flood-light-intensity', 0.6);
        }
      });
      */

      // ===========================================
      // VEHICLE CLICK INTERACTION - Detailed Info
      // ===========================================
      mapInstance.on('click', 'mbta-subway-3d', (e) => {
        if (!e.features || e.features.length === 0) return;

        // Ghost Point Guard: Don't interact with invisible trains
        const props = e.features[0].properties;
        if (!props) return;
        const coordinates = (e.features[0].geometry as any).coordinates.slice();

        // Get vehicle type icon
        let vehicleIcon = '🚇';
        let vehicleTypeName = 'Subway';
        if (props.vehicleType === 'lightrail') {
          vehicleIcon = '🚊';
          vehicleTypeName = 'Light Rail';
        } else if (props.vehicleType === 'commuter') {
          vehicleIcon = '🚆';
          vehicleTypeName = 'Commuter Rail';
        } else if (props.vehicleType === 'bus') {
          vehicleIcon = '🚌';
          vehicleTypeName = 'Bus';
        } else if (props.vehicleType === 'ferry') {
          vehicleIcon = '⛴️';
          vehicleTypeName = 'Ferry';
        }

        // Status text
        let statusText = 'In Transit';
        if (props.status === 'STOPPED_AT') statusText = 'Stopped at Station';
        else if (props.status === 'INCOMING_AT') statusText = 'Arriving Soon';

        // Occupancy/crowding
        let crowdingText = 'Unknown';
        let crowdingColor = '#666';
        if (props.occupancy === 'MANY_SEATS_AVAILABLE') {
          crowdingText = 'Plenty of Seats';
          crowdingColor = '#10b981';
        } else if (props.occupancy === 'FEW_SEATS_AVAILABLE') {
          crowdingText = 'Few Seats';
          crowdingColor = '#f59e0b';
        } else if (props.occupancy === 'STANDING_ROOM_ONLY') {
          crowdingText = 'Standing Room';
          crowdingColor = '#ef4444';
        } else if (props.occupancy === 'FULL') {
          crowdingText = 'Full';
          crowdingColor = '#dc2626';
        }

        const popupHTML = `
          <div class="transit-popup" style="min-width: 260px; max-width: 300px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
            <div style="padding: 4px 0;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <span style="font-size: 32px;">${vehicleIcon}</span>
                <div>
                  <div style="font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${vehicleTypeName}
                  </div>
                  <h3 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 700; color: #000; line-height: 1.2;">
                    ${props.label || 'Vehicle ' + props.id.substring(0, 8)}
                  </h3>
                </div>
              </div>
              
              <div style="margin: 12px 0; padding: 10px; background: #fafafa; border-radius: 6px; border-left: 3px solid ${props.routeColor || '#000'};">
                <div style="font-size: 12px; font-weight: 700; color: #000; margin-bottom: 4px;">
                  ${props.routeName || props.routeId}
                </div>
                <div style="font-size: 11px; color: #666; font-weight: 500;">
                  ${statusText}
                </div>
              </div>
              
              ${props.speed > 0 ? `<div style="margin: 10px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px;">⚡</span>
                <span style="font-size: 13px; color: #000; font-weight: 600;">${Math.round(props.speed)} mph</span>
              </div>` : ''}
              
              <div style="margin: 10px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px;">👥</span>
                <span style="font-size: 13px; color: ${crowdingColor}; font-weight: 600;">${crowdingText}</span>
              </div>
              
              ${props.carriageCount > 0 ? `<div style="margin: 10px 0; font-size: 12px; color: #666;">
                ${props.carriageCount} car${props.carriageCount > 1 ? 's' : ''}
              </div>` : ''}
            </div>
          </div>
        `;

        new mapboxgl.Popup({ maxWidth: '320px', className: 'transit-popup-container' })
          .setLngLat(coordinates)
          .setHTML(popupHTML)
          .addTo(mapInstance);

        // Also fly to the vehicle
        mapInstance.flyTo({
          center: coordinates,
          zoom: 17,
          pitch: 60,
          duration: 1500,
          essential: true
        });
      });

      // ===========================================
      // STATION/STOP CLICK INTERACTION
      // ===========================================
      mapInstance.on('click', 'stops-marker', (e) => {
        if (!e.features || e.features.length === 0) return;

        const props = e.features[0].properties;
        if (!props) return;
        const coordinates = (e.features[0].geometry as any).coordinates.slice();

        const popupHTML = `
          <div class="station-popup" style="min-width: 240px; max-width: 280px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
            <div style="padding: 4px 0;">
              <div style="display: inline-block; padding: 4px 10px; background: #000; color: #fff; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
                Station
              </div>
              
              <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #000; line-height: 1.3;">
                ${props.name}
              </h3>
              
              ${props.wheelchair ? `<div style="margin: 10px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px;">♿</span>
                <span style="font-size: 12px; color: #10b981; font-weight: 600;">Wheelchair Accessible</span>
              </div>` : ''}
              
              ${props.platformCode ? `<div style="margin: 10px 0; font-size: 12px; color: #666;">
                Platform: <span style="font-weight: 600; color: #000;">${props.platformCode}</span>
              </div>` : ''}
              
              <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #e5e7eb; font-size: 11px; color: #666;">
                Click for live arrivals
              </div>
            </div>
          </div>
        `;

        new mapboxgl.Popup({ maxWidth: '300px', className: 'station-popup-container' })
          .setLngLat(coordinates)
          .setHTML(popupHTML)
          .addTo(mapInstance);
      });

      // Cursor change on stop hover
      mapInstance.on('mouseenter', 'stops-marker', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });

      mapInstance.on('mouseleave', 'stops-marker', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

      // Cursor change on vehicle hover (respecting opacity)
      mapInstance.on('mouseenter', 'mbta-subway-3d', (e) => {
        if (e.features && e.features[0].properties?.opacity > 0) {
          mapInstance.getCanvas().style.cursor = 'pointer';
        }
      });

      mapInstance.on('mouseleave', 'mbta-subway-3d', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

      // Cursor change on building hover
      mapInstance.on('mouseenter', 'buildings-3d', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });

      mapInstance.on('mouseleave', 'buildings-3d', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

      mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Add Geolocation Control - asks browser for user's location
      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        },
        trackUserLocation: true,
        showUserHeading: true,
      });
      mapInstance.addControl(geolocate, 'top-right');

      // Listen for geolocation results
      geolocate.on('geolocate', (e: any) => {
        const coords: [number, number] = [e.coords.longitude, e.coords.latitude];
        setUserLocation(coords);
        console.log('[Geolocation] User location:', coords);
      });

      // ===========================================
      // LOAD INITIAL DATA DIRECTLY (Right after sources are created)
      // ===========================================
      console.log('[Map] Loading initial data inside on(load)...');

      try {
        const [landmarksData, eventsData, restaurantsData] = await Promise.all([
          fetchLandmarks(),
          fetchEvents(),
          fetchNYCRestaurants(),
        ]);

        console.log('[Landmarks] Loaded:', landmarksData.length, 'landmarks');
        console.log('[Events] Loaded:', eventsData.length, 'events');
        console.log('[Restaurants] Loaded:', restaurantsData.length, 'restaurants');

        // Set landmarks data
        if (mapInstance.getSource('landmarks')) {
          const landmarksGeoJSON = landmarksToGeoJSON(landmarksData);
          console.log('[Landmarks] Setting GeoJSON with', landmarksGeoJSON.features.length, 'features');
          (mapInstance.getSource('landmarks') as mapboxgl.GeoJSONSource).setData(landmarksGeoJSON);
          console.log('[Landmarks] ✓ Data set on map!');
        } else {
          console.warn('[Landmarks] Source not found!');
        }

        // Set events data
        if (mapInstance.getSource('events')) {
          const eventsGeoJSON = eventsToGeoJSON(eventsData);
          console.log('[Events] Setting GeoJSON with', eventsGeoJSON.features.length, 'features');
          (mapInstance.getSource('events') as mapboxgl.GeoJSONSource).setData(eventsGeoJSON);
          console.log('[Events] ✓ Data set on map!');
        } else {
          console.warn('[Events] Source not found!');
        }

        // Set restaurants data to 'places' source
        if (mapInstance.getSource('places')) {
          const restaurantsGeoJSON = nycRestaurantsToGeoJSON(restaurantsData);
          console.log('[Restaurants] Setting GeoJSON with', restaurantsGeoJSON.features.length, 'features');
          (mapInstance.getSource('places') as mapboxgl.GeoJSONSource).setData(restaurantsGeoJSON);
          console.log('[Restaurants] ✓ Data set on map!');
        } else {
          console.warn('[Restaurants] Source not found!');
        }

        console.log('[Map] ✓ All initial data loaded successfully!');
      } catch (error) {
        console.error('[Map] Error loading initial data:', error);
      }

      setIsLoaded(true);
    });

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (mbtaIntervalRef.current) clearInterval(mbtaIntervalRef.current);
      map.current?.remove();
    };
  }, []);

  // ===========================================
  // LERP-BASED TRAIN TRACKING (Real MTA Data)
  // ===========================================

  // MTA route colors for visualization
  const MTA_ROUTE_COLORS: Record<string, string> = {
    '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
    '4': '#00933C', '5': '#00933C', '6': '#00933C',
    '7': '#B933AD',
    'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
    'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
    'G': '#6CBE45',
    'J': '#996633', 'Z': '#996633',
    'L': '#A7A9AC',
    'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
    'S': '#808183'
  };

  // Types for train tracking
  interface MTATrain {
    id: string;
    routeId: string;
    currentStopId: string;
    currentStop: { lat: number; lng: number; name: string } | null;
    nextStopId: string | null;
    nextStop: { lat: number; lng: number; name: string } | null;
    status: 'STOPPED_AT' | 'IN_TRANSIT_TO';
    progress: number;
    departureTime: number;
    arrivalTime: number;
    timestamp: number;
  }

  // Ref to store train state from API
  const trainDataRef = useRef<{
    trains: MTATrain[];
    lastFetch: number;
  }>({ trains: [], lastFetch: 0 });

  // Fetch train data from API (every 30 seconds)
  const fetchTrainData = useCallback(async () => {
    try {
      const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/api/mta/trains`);
      if (!response.ok) throw new Error('Failed to fetch trains');
      const data = await response.json();

      trainDataRef.current.trains = data.trains || [];
      trainDataRef.current.lastFetch = Date.now();

      console.log(`[MTA] Fetched ${data.count} trains with coordinates`);
    } catch (error) {
      console.error('[MTA] Error fetching train data:', error);
    }
  }, []);

  // Poll for train data every 30 seconds
  useEffect(() => {
    if (!isLoaded) return;

    // Initial fetch
    fetchTrainData();

    // Set up polling interval (every 30 seconds as per MTA update frequency)
    const intervalId = setInterval(fetchTrainData, 30000);
    mbtaIntervalRef.current = intervalId;

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isLoaded, fetchTrainData]);

  // LERP animation loop - smooth 60fps interpolation between API updates
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    let animationId: number;

    // Helper to calculate bearing between two points
    const getBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
      const startLatRad = startLat * (Math.PI / 180);
      const startLngRad = startLng * (Math.PI / 180);
      const destLatRad = destLat * (Math.PI / 180);
      const destLngRad = destLng * (Math.PI / 180);

      const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
      const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
        Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
      const brng = Math.atan2(y, x);
      return (brng * 180 / Math.PI + 360) % 360;
    };

    const animateTrains = () => {
      const now = Math.floor(Date.now() / 1000);
      const trainFeatures: GeoJSON.Feature[] = [];

      trainDataRef.current.trains.forEach(train => {
        if (!train.currentStop) return;

        let lat: number;
        let lng: number;
        let bearing: number = 0;

        if (train.status === 'IN_TRANSIT_TO' && train.nextStop) {
          // Calculate real-time LERP progress
          const elapsed = now - train.departureTime;
          const duration = train.arrivalTime - train.departureTime;
          const lerpProgress = duration > 0
            ? Math.min(1, Math.max(0, elapsed / duration))
            : train.progress;

          // Interpolate between current and next stop
          lat = train.currentStop.lat + (train.nextStop.lat - train.currentStop.lat) * lerpProgress;
          lng = train.currentStop.lng + (train.nextStop.lng - train.currentStop.lng) * lerpProgress;

          // Calculate bearing
          bearing = getBearing(train.currentStop.lat, train.currentStop.lng, train.nextStop.lat, train.nextStop.lng);
        } else {
          // Train is stopped at station
          lat = train.currentStop.lat;
          lng = train.currentStop.lng;
          // Keep previous bearing or typical station alignment (optional)
          // For now, default to 0 or try to infer from route geometry if possible, 
          // but simpler to just hold last bearing if we had state. 
          // Since we don't track per-train state across frames easily here without mapped state, 
          // we'll leave it at 0 or look ahead if possible.
          // Let's assume 0 for stopped, or better, pointing to next stop if known
          if (train.nextStop) {
            bearing = getBearing(train.currentStop.lat, train.currentStop.lng, train.nextStop.lat, train.nextStop.lng);
          }
        }

        trainFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          properties: {
            id: train.id,
            routeId: train.routeId,
            color: MTA_ROUTE_COLORS[train.routeId] || '#00f3ff',
            status: train.status,
            stopName: train.currentStop.name || train.currentStopId,
            bearing: bearing - 90 // Adjust rotation: Model likely faces +X or we need to correct for Mapbox rotation
          }
        });
      });

      // Update the map source
      const source = map.current?.getSource('nyc-trains') as mapboxgl.GeoJSONSource;
      if (source && trainFeatures.length > 0) {
        source.setData({
          type: 'FeatureCollection',
          features: trainFeatures
        });
        // Debug log every 5 seconds
        if (Math.floor(Date.now() / 5000) !== Math.floor((Date.now() - 100) / 5000)) {
          console.log(`[MTA LERP] Updated ${trainFeatures.length} trains on map`);
        }
      } else if (trainDataRef.current.trains.length === 0) {
        // No data yet - waiting for first fetch
      } else if (!source) {
        console.warn('[MTA] nyc-trains source not found on map!');
      }

      animationId = requestAnimationFrame(animateTrains);
    };

    // Start animation loop
    animationId = requestAnimationFrame(animateTrains);

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  // ===========================================
  // MINIMAL ANIMATION - Building Breathing Only
  // ===========================================
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    const animate = () => {
      // Safety Check: Ensure map and style are fully ready
      if (!map.current || !map.current.getStyle()) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Animation frame for future enhancements
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isLoaded, systemStress]);

  // Transit visibility toggle
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    const vis = settings.showTransit && showTransitLayers ? 'visible' : 'none';
    const layers = [
      'tracks-bed', 'tracks-route-glow', 'tracks-core',
      'trails-glow', 'trails-core', 'trails-head',
      'stops-glow', 'stops-marker',
      'glow-zone',
      // Commuter rail and Amtrak layers
      'trains-core',
      // Vehicle layers
      'vehicles-shadow', 'vehicles-glow',
      'bus-body', 'bus-label', 'bus-direction',
      'mbta-subway-3d', 'vehicles-glow', // New 3D layers
      'nyc-trains-model', 'nyc-trains-glow', // NYC 3D Trains
      'ferry-body', 'ferry-label',
      // NYC Subway routes and stations (ALL layers)
      'nyc-routes-line', 'nyc-routes-glow', 'nyc-routes-core',
      'nyc-stations-circle', 'nyc-stations-glow', 'nyc-stations-label'
    ];

    layers.forEach(layer => {
      try {
        if (map.current?.getLayer(layer)) {
          map.current.setLayoutProperty(layer, 'visibility', vis);
          console.log(`[Transit] ${layer} visibility set to ${vis}`);
        }
      } catch {
        // Silently skip layers that don't exist (some may be optional)
      }
    });
  }, [settings.showTransit, showTransitLayers, isLoaded]);

  // Update user location marker when location changes
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    const source = map.current.getSource('human-location') as mapboxgl.GeoJSONSource;
    if (!source) return;

    const location = userLocation || [-71.0657, 42.3550]; // Default to Boston Common if no location

    source.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: location
        },
        properties: {
          bearing: 0
        }
      }]
    });

    if (userLocation) {
      console.log('[Map] User location marker updated:', userLocation);
    }
  }, [userLocation, isLoaded]);

  // Check if search results are active (hide base layers when searching)
  const hasSearchResults = searchResults && searchResults.features && searchResults.features.length > 0;

  // Place visibility toggle - HIDE when search results are shown
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    // Hide base layer if search results are active
    const vis = (showPlaces && !hasSearchResults) ? 'visible' : 'none';
    const layers = [
      'places-glow',
      'places-marker',
      'places-label'
    ];

    layers.forEach(layer => {
      try {
        if (map.current?.getLayer(layer)) {
          map.current.setLayoutProperty(layer, 'visibility', vis);
          console.log(`[Places] ${layer} visibility set to ${vis}`);
        } else {
          console.warn(`[Places] Layer "${layer}" not found on map`);
        }
      } catch (error) {
        console.error(`[Places] Error setting visibility for ${layer}:`, error);
      }
    });
  }, [showPlaces, isLoaded, hasSearchResults]);

  // Events visibility toggle - HIDE when search results are shown
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    // Hide base layer if search results are active
    const vis = (showEvents && !hasSearchResults) ? 'visible' : 'none';
    const layers = [
      'events-glow',
      'events-marker',
      'events-label'
    ];

    layers.forEach(layer => {
      try {
        if (map.current?.getLayer(layer)) {
          map.current.setLayoutProperty(layer, 'visibility', vis);
          console.log(`[Events] ${layer} visibility set to ${vis}`);
        } else {
          console.warn(`[Events] Layer "${layer}" not found on map`);
        }
      } catch (error) {
        console.error(`[Events] Error setting visibility for ${layer}:`, error);
      }
    });
  }, [showEvents, isLoaded, hasSearchResults]);

  // Landmarks visibility toggle - HIDE when search results are shown
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    // Hide base layer if search results are active
    const vis = (showLandmarks && !hasSearchResults) ? 'visible' : 'none';
    const layers = [
      'landmarks-glow',
      'landmarks-marker',
      'landmarks-label'
    ];

    layers.forEach(layer => {
      try {
        if (map.current?.getLayer(layer)) {
          map.current.setLayoutProperty(layer, 'visibility', vis);
          console.log(`[Landmarks] ${layer} visibility set to ${vis}`);
        } else {
          console.warn(`[Landmarks] Layer "${layer}" not found on map`);
        }
      } catch (error) {
        console.error(`[Landmarks] Error setting visibility for ${layer}:`, error);
      }
    });
  }, [showLandmarks, isLoaded, hasSearchResults]);

  // Itinerary visualization
  useEffect(() => {
    if (!map.current || !isLoaded || !itineraryRouteData) {
      // Clear itinerary if no data
      if (map.current?.getSource('itinerary-routes')) {
        (map.current.getSource('itinerary-routes') as mapboxgl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: []
        });
      }
      if (map.current?.getSource('itinerary-stops')) {
        (map.current.getSource('itinerary-stops') as mapboxgl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: []
        });
      }

      // Restore visibility of all layers when itinerary is cleared
      if (map.current && isLoaded) {
        // Restore transit (if showTransitLayers was true)
        const transitVis = showTransitLayers ? 'visible' : 'none';
        ['trails-glow', 'trails-core', 'trails-head', 'stops-glow', 'stops-marker',
          'glow-zone', 'trains-core', 'vehicles-glow', 'mbta-subway-3d',
          'ferry-body', 'ferry-label'].forEach(layer => {
            if (map.current?.getLayer(layer)) {
              map.current.setLayoutProperty(layer, 'visibility', transitVis);
            }
          });

        // Restore places (if showPlaces was true)
        const placesVis = showPlaces ? 'visible' : 'none';
        ['places-glow', 'places-marker', 'places-label'].forEach(layer => {
          if (map.current?.getLayer(layer)) {
            map.current.setLayoutProperty(layer, 'visibility', placesVis);
          }
        });

        // Restore events (if showEvents was true)
        const eventsVis = showEvents ? 'visible' : 'none';
        ['events-glow', 'events-marker', 'events-label'].forEach(layer => {
          if (map.current?.getLayer(layer)) {
            map.current.setLayoutProperty(layer, 'visibility', eventsVis);
          }
        });

        // Restore landmarks (if showLandmarks was true)
        const landmarksVis = showLandmarks ? 'visible' : 'none';
        ['landmarks-glow', 'landmarks-marker', 'landmarks-label'].forEach(layer => {
          if (map.current?.getLayer(layer)) {
            map.current.setLayoutProperty(layer, 'visibility', landmarksVis);
          }
        });

        // Hide itinerary layers
        ['itinerary-walking-glow', 'itinerary-walking', 'itinerary-transit-glow', 'itinerary-transit-border',
          'itinerary-transit', 'itinerary-transit-center', 'itinerary-stops-circle', 'itinerary-stops-icon',
          'itinerary-stops-number-bg', 'itinerary-stops-number', 'itinerary-stops-label'].forEach(layer => {
            if (map.current?.getLayer(layer)) {
              map.current.setLayoutProperty(layer, 'visibility', 'none');
            }
          });

        // Remove Font Awesome itinerary markers when clearing
        document.querySelectorAll('.custom-marker-itinerary').forEach(el => {
          el.remove();
        });

        console.log('[Itinerary] Cleared - restoring other layers');
      }

      setShowItinerary(false);
      return;
    }

    const mapInstance = map.current;

    // Handle simple points format from smart planner
    if (itineraryRouteData.points && Array.isArray(itineraryRouteData.points)) {
      console.log('[Itinerary] Rendering route with', itineraryRouteData.points.length, 'points');

      const points = itineraryRouteData.points;

      // Build stop features - map types to layer-compatible types
      const typeMapping: { [key: string]: string } = {
        'start': 'hotel',      // User location - gold
        'food': 'meal',        // Restaurants - orange  
        'landmark': 'visit',   // Landmarks - purple
        'event': 'activity',   // Events - blue
        'transit': 'activity'  // Transit - blue
      };

      const stopFeatures = points.map((point: any, index: number) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [point.lng, point.lat]
        },
        properties: {
          name: point.name,
          type: typeMapping[point.type] || 'visit',
          order: index + 1,
          isStart: point.type === 'start',
          originalType: point.type
        }
      }));

      // Set stops data immediately
      if (mapInstance.getSource('itinerary-stops')) {
        (mapInstance.getSource('itinerary-stops') as mapboxgl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: stopFeatures
        });
      }

      // HIDE old circle/icon layers - we're using Font Awesome markers instead
      ['itinerary-stops-glow', 'itinerary-stops-circle', 'itinerary-stops-highlight', 'itinerary-stops-icon',
        'itinerary-stops-number-bg', 'itinerary-stops-number', 'itinerary-stops-label'].forEach(layer => {
          if (mapInstance.getLayer(layer)) {
            mapInstance.setLayoutProperty(layer, 'visibility', 'none');
          }
        });

      // Remove any existing Font Awesome itinerary markers before adding new ones
      document.querySelectorAll('.custom-marker-itinerary').forEach(el => {
        el.remove();
      });

      // Create premium styled location markers for itinerary stops
      points.forEach((point: any, index: number) => {
        const el = document.createElement('div');
        el.className = 'custom-marker custom-marker-itinerary';
        el.innerHTML = `
          <div style="position: relative; display: inline-block; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);">
            <!-- Animated pulse ring -->
            <div style="position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, rgba(249,115,22,0.4) 0%, transparent 70%); animation: pulse-ring 2s ease-out infinite;"></div>
            <!-- Outer glow -->
            <div style="position: absolute; top: -8px; left: -8px; width: 56px; height: 56px; background: radial-gradient(circle, rgba(249,115,22,0.6) 0%, transparent 60%); border-radius: 50%; filter: blur(8px);"></div>
            <!-- Main pin body -->
            <div style="position: relative; width: 40px; height: 40px; background: linear-gradient(145deg, #1a1a2e 0%, #0f0f1a 100%); border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid #f97316; box-shadow: 0 4px 20px rgba(249,115,22,0.5), inset 0 1px 0 rgba(255,255,255,0.1);">
              <!-- Inner circle with number -->
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(45deg); width: 28px; height: 28px; background: linear-gradient(145deg, #f97316 0%, #ea580c 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 2px 4px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.3);">
                <span style="font-size: 14px; font-weight: 800; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${index + 1}</span>
              </div>
            </div>
            <!-- Pin point shadow -->
            <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 16px; height: 4px; background: rgba(0,0,0,0.3); border-radius: 50%; filter: blur(2px);"></div>
          </div>
        `;
        
        // Add CSS animation for pulse ring
        if (!document.querySelector('#itinerary-pin-styles')) {
          const style = document.createElement('style');
          style.id = 'itinerary-pin-styles';
          style.textContent = `
            @keyframes pulse-ring {
              0% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; }
              100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
            }
          `;
          document.head.appendChild(style);
        }
        
        const marker = new mapboxgl.Marker(el)
          .setLngLat([point.lng, point.lat])
          .addTo(mapInstance);
        
        // Add hover effect
        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.15) translateY(-3px)';
          el.style.filter = 'brightness(1.1)';
        });
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1) translateY(0)';
          el.style.filter = 'brightness(1)';
        });

        // Add click handler for popup
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          
          // Get type icon and color
          const typeConfig: { [key: string]: { icon: string; color: string; label: string; emoji: string } } = {
            'start': { icon: 'fa-location-dot', color: '#10b981', label: 'Starting Point', emoji: '📍' },
            'food': { icon: 'fa-utensils', color: '#f97316', label: 'Restaurant', emoji: '🍽️' },
            'landmark': { icon: 'fa-landmark', color: '#8b5cf6', label: 'Landmark', emoji: '🏛️' },
            'event': { icon: 'fa-calendar-star', color: '#ec4899', label: 'Event', emoji: '🎭' },
            'activity': { icon: 'fa-person-running', color: '#3b82f6', label: 'Activity', emoji: '🎯' },
          };
          const config = typeConfig[point.type] || { icon: 'fa-map-pin', color: '#f97316', label: 'Stop', emoji: '📌' };
          
          // Calculate next stop info
          const nextStop = index < points.length - 1 ? points[index + 1] : null;
          
          // Time display - format arrival and departure times
          const timeDisplay = point.arrivalTime && point.departureTime 
            ? `${point.arrivalTime} → ${point.departureTime}`
            : point.arrivalTime || '';
          
          // Google Maps URLs
          const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point.name)}`;
          const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
          const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point.lat},${point.lng}`;
          
          // For start point, show minimal popup
          if (point.type === 'start') {
            const startPopupHTML = `
              <div class="itinerary-stop-popup" style="min-width: 220px; max-width: 260px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
                <div style="height: 4px; background: linear-gradient(90deg, #10b981, #10b98180);"></div>
                <div style="padding: 16px;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 44px; height: 44px; background: linear-gradient(145deg, #10b981, #10b981cc); border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(16,185,129,0.4);">
                      <i class="fa-solid fa-flag-checkered" style="font-size: 18px; color: #fff;"></i>
                    </div>
                    <div>
                      <h3 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: #fff;">Your Starting Point</h3>
                      <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.5);">Your adventure begins here!</p>
                    </div>
                  </div>
                </div>
                <div style="padding: 12px 16px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.06);">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-arrow-right" style="font-size: 10px; color: #10b981;"></i>
                    <span style="font-size: 11px; color: rgba(255,255,255,0.6);">Next: <span style="color: #fff; font-weight: 500;">${nextStop?.name || 'End'}</span></span>
                  </div>
                </div>
              </div>
            `;
            
            new mapboxgl.Popup({ 
              maxWidth: '280px', 
              className: 'dark-popup itinerary-popup',
              closeButton: true,
              closeOnClick: false,
              offset: [0, -25],
              focusAfterOpen: false
            })
              .setLngLat([point.lng, point.lat])
              .setHTML(startPopupHTML)
              .addTo(mapInstance);
            return;
          }
          
          const popupHTML = `
            <div class="itinerary-stop-popup" style="min-width: 300px; max-width: 340px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
              
              <!-- Accent bar at top -->
              <div style="height: 4px; background: linear-gradient(90deg, ${config.color}, ${config.color}80);"></div>
              
              <!-- Header with time range -->
              <div style="padding: 16px 16px 12px; background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);">
                <!-- Time range banner -->
                ${timeDisplay ? `
                  <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px; padding: 8px 12px; background: ${config.color}15; border-radius: 8px; border: 1px solid ${config.color}30;">
                    <i class="fa-solid fa-clock" style="font-size: 12px; color: ${config.color};"></i>
                    <span style="font-size: 14px; font-weight: 700; color: #fff; letter-spacing: 0.5px;">${timeDisplay}</span>
                  </div>
                ` : ''}
                
                <div style="display: flex; align-items: flex-start; gap: 14px;">
                  <!-- Stop number badge -->
                  <div style="position: relative;">
                    <div style="width: 48px; height: 48px; background: linear-gradient(145deg, ${config.color}, ${config.color}cc); border-radius: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px ${config.color}50, inset 0 1px 0 rgba(255,255,255,0.2);">
                      <span style="font-size: 20px; font-weight: 800; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${index + 1}</span>
                    </div>
                  </div>
                  
                  <!-- Title and type -->
                  <div style="flex: 1; min-width: 0;">
                    <h3 style="margin: 0 0 6px; font-size: 16px; font-weight: 700; color: #fff; line-height: 1.25;">${point.name}</h3>
                    <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: ${config.color}20; border-radius: 20px; border: 1px solid ${config.color}40;">
                      <i class="fa-solid ${config.icon}" style="font-size: 10px; color: ${config.color};"></i>
                      <span style="font-size: 11px; color: ${config.color}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;">${config.label}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Quick stats row -->
              <div style="padding: 0 16px 12px; display: flex; gap: 8px;">
                ${point.duration ? `
                  <div style="flex: 1; padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); text-align: center;">
                    <div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 2px;">${point.duration}</div>
                    <div style="font-size: 9px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px;">Duration</div>
                  </div>
                ` : ''}
                ${point.cost ? `
                  <div style="flex: 1; padding: 10px 12px; background: rgba(16,185,129,0.08); border-radius: 10px; border: 1px solid rgba(16,185,129,0.2); text-align: center;">
                    <div style="font-size: 15px; font-weight: 700; color: #10b981; margin-bottom: 2px;">${point.cost}</div>
                    <div style="font-size: 9px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px;">Est. Cost</div>
                  </div>
                ` : ''}
              </div>
              
              <!-- What to do section -->
              ${point.whatToDo ? `
                <div style="padding: 0 16px 12px;">
                  <div style="padding: 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                      <i class="fa-solid fa-lightbulb" style="font-size: 11px; color: ${config.color};"></i>
                      <span style="font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">What to do</span>
                    </div>
                    <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.85); line-height: 1.5;">${point.whatToDo}</p>
                  </div>
                </div>
              ` : ''}
              
              <!-- Why visit section -->
              ${point.whyVisit ? `
                <div style="padding: 0 16px 12px;">
                  <div style="padding: 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                      <i class="fa-solid fa-star" style="font-size: 11px; color: #fbbf24;"></i>
                      <span style="font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Why visit</span>
                    </div>
                    <p style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.7); line-height: 1.5;">${point.whyVisit}</p>
                  </div>
                </div>
              ` : ''}
              
              <!-- Pro tip -->
              ${point.proTip ? `
                <div style="padding: 0 16px 12px;">
                  <div style="padding: 10px 12px; background: linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(251,191,36,0.05) 100%); border-radius: 10px; border: 1px solid rgba(251,191,36,0.2);">
                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                      <span style="font-size: 14px;">💡</span>
                      <div>
                        <span style="font-size: 10px; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">Pro Tip</span>
                        <p style="margin: 4px 0 0; font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.4;">${point.proTip}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ` : ''}
              
              <!-- Next stop preview -->
              ${nextStop ? `
                <div style="padding: 0 16px 12px;">
                  <div style="padding: 10px 12px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                      <span style="font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase;">Next Stop</span>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 12px; color: rgba(255,255,255,0.8); font-weight: 500;">${nextStop.name}</span>
                        <i class="fa-solid fa-arrow-right" style="font-size: 10px; color: ${config.color};"></i>
                      </div>
                    </div>
                  </div>
                </div>
              ` : ''}
              
              <!-- Action buttons -->
              <div style="padding: 12px 16px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; gap: 8px;">
                  <a href="${directionsUrl}" target="_blank" rel="noopener" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 12px; background: linear-gradient(145deg, ${config.color}, ${config.color}dd); border-radius: 10px; color: #fff; text-decoration: none; font-size: 12px; font-weight: 600; transition: all 0.2s; box-shadow: 0 2px 8px ${config.color}40;">
                    <i class="fa-solid fa-diamond-turn-right" style="font-size: 12px;"></i>
                    Get Directions
                  </a>
                  <a href="${googleMapsUrl}" target="_blank" rel="noopener" style="display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; background: rgba(255,255,255,0.08); border-radius: 10px; color: rgba(255,255,255,0.7); text-decoration: none; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.1);" title="Open in Google Maps">
                    <i class="fa-solid fa-map-location-dot" style="font-size: 14px;"></i>
                  </a>
                  <a href="${streetViewUrl}" target="_blank" rel="noopener" style="display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; background: rgba(255,255,255,0.08); border-radius: 10px; color: rgba(255,255,255,0.7); text-decoration: none; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.1);" title="Street View">
                    <i class="fa-solid fa-street-view" style="font-size: 14px;"></i>
                  </a>
                </div>
                
                <!-- Progress indicator -->
                <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                  <div style="flex: 1; height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                    <div style="width: ${((index + 1) / points.length) * 100}%; height: 100%; background: linear-gradient(90deg, ${config.color}, ${config.color}80); border-radius: 2px;"></div>
                  </div>
                  <span style="font-size: 10px; color: rgba(255,255,255,0.4); font-weight: 500;">Stop ${index}/${points.length - 1}</span>
                </div>
              </div>
            </div>
          `;

          new mapboxgl.Popup({ 
            maxWidth: '360px', 
            className: 'dark-popup itinerary-popup',
            closeButton: true,
            closeOnClick: false,  // Allow multiple popups to stay open
            offset: [0, -25],
            focusAfterOpen: false
          })
            .setLngLat([point.lng, point.lat])
            .setHTML(popupHTML)
            .addTo(mapInstance);
        });
      });

      // Fit map to show all points
      if (points.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        points.forEach((p: any) => bounds.extend([p.lng, p.lat]));
        mapInstance.fitBounds(bounds, {
          padding: { top: 100, bottom: 150, left: 100, right: 350 },
          duration: 1500
        });
      }

      // Fetch real directions - uses walking + subway for long distances
      const fetchDirections = async () => {
        if (points.length < 2) return;

        const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
        const allRouteFeatures: any[] = [];

        // NYC Subway stations data (imported from nycSubwayStations.json)
        const subwayStations = [
          { name: "Times Sq-42 St", routes: "1237NQRS", lng: -73.9867, lat: 40.7559 },
          { name: "Grand Central-42 St", routes: "4567S", lng: -73.9772, lat: 40.7527 },
          { name: "W 4 St-Wash Sq", routes: "ABCDEFM", lng: -74.0004, lat: 40.7308 },
          { name: "Herald Sq-34 St", routes: "BDFMNQRW", lng: -73.988, lat: 40.7496 },
          { name: "1 Av", routes: "L", lng: -73.9816, lat: 40.7305 },
          { name: "96 St", routes: "123", lng: -73.9723, lat: 40.7961 },
          { name: "Queensboro Plaza", routes: "7NQW", lng: -73.9402, lat: 40.7504 },
          { name: "Court Sq", routes: "EGM", lng: -73.9442, lat: 40.7466 },
          { name: "Atlantic Av-Barclays", routes: "2345BDNQR", lng: -73.9778, lat: 40.684 },
          { name: "14 St-Union Sq", routes: "456LNQRW", lng: -73.9903, lat: 40.7356 },
          { name: "Penn Station", routes: "123ACE", lng: -73.9932, lat: 40.7506 },
          { name: "Fulton St", routes: "2345ACJZ", lng: -74.0065, lat: 40.7102 },
          { name: "Jay St-MetroTech", routes: "ACFR", lng: -73.9862, lat: 40.6923 },
          { name: "Bedford Av", routes: "L", lng: -73.9566, lat: 40.7174 },
          { name: "Lorimer St", routes: "LG", lng: -73.9502, lat: 40.7140 },
          { name: "Marcy Av", routes: "JMZ", lng: -73.9579, lat: 40.7083 },
        ];

        // Subway line colors
        const lineColors: { [key: string]: string } = {
          '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
          '4': '#00933C', '5': '#00933C', '6': '#00933C',
          '7': '#B933AD',
          'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
          'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
          'G': '#6CBE45',
          'J': '#996633', 'Z': '#996633',
          'L': '#A7A9AC',
          'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
          'S': '#808183'
        };

        // Calculate distance between two points (in meters)
        const getDistance = (p1: any, p2: any) => {
          const R = 6371000;
          const lat1 = p1.lat * Math.PI / 180;
          const lat2 = p2.lat * Math.PI / 180;
          const dLat = (p2.lat - p1.lat) * Math.PI / 180;
          const dLng = (p2.lng - p1.lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        // Find nearest subway station
        const findNearestStation = (point: any) => {
          let nearest = subwayStations[0];
          let minDist = getDistance(point, nearest);
          for (const station of subwayStations) {
            const dist = getDistance(point, station);
            if (dist < minDist) {
              minDist = dist;
              nearest = station;
            }
          }
          return { station: nearest, distance: minDist };
        };

        // Get walking directions
        const getWalkingRoute = async (from: any, to: any) => {
          const waypoints = `${from.lng},${from.lat};${to.lng},${to.lat}`;
          const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/walking/${waypoints}?geometries=geojson&overview=full&access_token=${mapboxToken}`
          );
          if (response.ok) {
            const data = await response.json();
            return data.routes?.[0] || null;
          }
          return null;
        };

        try {
          for (let i = 0; i < points.length - 1; i++) {
            const from = points[i];
            const to = points[i + 1];
            const directDistance = getDistance(from, to);

            // If distance > 1.5km, use subway
            if (directDistance > 1500) {
              const fromStation = findNearestStation(from);
              const toStation = findNearestStation(to);

              console.log(`[Itinerary] Subway route: ${from.name} → ${fromStation.station.name} → ${toStation.station.name} → ${to.name}`);

              // 1. Walk to station
              const walkToStation = await getWalkingRoute(from, fromStation.station);
              if (walkToStation) {
                allRouteFeatures.push({
                  type: 'Feature',
                  geometry: walkToStation.geometry,
                  properties: { mode: 'walking', routeColor: '#10b981', duration: walkToStation.duration }
                });
              }

              // 2. Subway segment (straight line between stations with subway color)
              const subwayLine = fromStation.station.routes[0]; // First available line
              const subwayColor = lineColors[subwayLine] || '#3b82f6';
              const subwayDist = getDistance(fromStation.station, toStation.station);
              const subwayMin = Math.round(subwayDist / 500); // ~500m per minute on subway

              allRouteFeatures.push({
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [fromStation.station.lng, fromStation.station.lat],
                    [toStation.station.lng, toStation.station.lat]
                  ]
                },
                properties: {
                  mode: 'transit',
                  routeColor: subwayColor,
                  duration: subwayMin * 60,
                  line: subwayLine
                }
              });

              // 3. Walk from station to destination
              const walkFromStation = await getWalkingRoute(toStation.station, to);
              if (walkFromStation) {
                allRouteFeatures.push({
                  type: 'Feature',
                  geometry: walkFromStation.geometry,
                  properties: { mode: 'walking', routeColor: '#10b981', duration: walkFromStation.duration }
                });
              }

            } else {
              // Short distance - just walk
              const walkRoute = await getWalkingRoute(from, to);
              if (walkRoute) {
                allRouteFeatures.push({
                  type: 'Feature',
                  geometry: walkRoute.geometry,
                  properties: { mode: 'walking', routeColor: '#10b981', duration: walkRoute.duration }
                });
              }
            }
          }

          // Calculate totals
          const totalDuration = allRouteFeatures.reduce((sum, f) => sum + (f.properties.duration || 0), 0);
          const totalMin = Math.round(totalDuration / 60);
          console.log('[Itinerary] Total trip:', totalMin, 'min');

          // Callback with route info to update sidebar
          const segments = allRouteFeatures.map(f => ({
            mode: f.properties.mode,
            duration: Math.round((f.properties.duration || 0) / 60)
          }));

          console.log('[Itinerary] Route segments:', segments);
          console.log('[Itinerary] onRouteCalculated callback exists:', !!onRouteCalculated);

          if (onRouteCalculated) {
            onRouteCalculated({
              totalDuration: totalMin,
              segments
            });
            console.log('[Itinerary] Callback called with:', { totalDuration: totalMin, segments });
          }

          // Set route data
          if (mapInstance.getSource('itinerary-routes')) {
            (mapInstance.getSource('itinerary-routes') as mapboxgl.GeoJSONSource).setData({
              type: 'FeatureCollection',
              features: allRouteFeatures
            });
          }

          // Show route layers
          ['itinerary-walking-glow', 'itinerary-walking', 'itinerary-transit-glow', 'itinerary-transit-border', 'itinerary-transit', 'itinerary-transit-center'].forEach(layer => {
            if (mapInstance.getLayer(layer)) {
              mapInstance.setLayoutProperty(layer, 'visibility', 'visible');
            }
          });

          console.log('[Itinerary] Smart transit route rendered!');

        } catch (error) {
          console.error('[Itinerary] Route error:', error);
        }
      };

      fetchDirections();
      setShowItinerary(true);
      return;
    }

    // MBTA line colors (for complex schedule format)
    const transitColors: { [key: string]: string } = {
      'red line': '#da291c',
      'red': '#da291c',
      'blue line': '#003da5',
      'blue': '#003da5',
      'orange line': '#ff7a00',
      'orange': '#ff7a00',
      'green line': '#00a651',
      'green': '#00a651',
      'green-b': '#00a651',
      'green-c': '#00a651',
      'green-d': '#00a651',
      'green-e': '#00a651',
      'silver line': '#7c8ca3',
      'silver': '#7c8ca3',
      'commuter rail': '#56236E',
      'commuter': '#56236E',
    };

    // Get the active day schedule (complex format)
    const schedule = itineraryRouteData.isMultiDay && itineraryRouteData.days
      ? itineraryRouteData.days[selectedItineraryDay]?.schedule
      : itineraryRouteData.schedule;

    if (!schedule || !Array.isArray(schedule)) return;

    // Build location lookup from itemLocations and originalItems
    const locationLookup: Map<string, [number, number]> = new Map();

    // Add hotel location - check multiple possible formats
    const hotel = itineraryRouteData.hotel;
    if (hotel) {
      let hotelCoords: [number, number] | null = null;

      if (hotel.latitude && hotel.longitude) {
        hotelCoords = [hotel.longitude, hotel.latitude];
      } else if (hotel.lat && hotel.lng) {
        hotelCoords = [hotel.lng, hotel.lat];
      } else if (hotel.location?.lat && hotel.location?.lng) {
        hotelCoords = [hotel.location.lng, hotel.location.lat];
      }

      if (hotelCoords) {
        locationLookup.set('hotel', hotelCoords);
        locationLookup.set('lark', hotelCoords);
        locationLookup.set('lark hotels', hotelCoords);
        if (hotel.name) {
          locationLookup.set(hotel.name.toLowerCase(), hotelCoords);
          // Add partial matches for hotel name
          const hotelWords = hotel.name.toLowerCase().split(/[\s,]+/);
          hotelWords.forEach((word: string) => {
            if (word.length > 3) locationLookup.set(word, hotelCoords!);
          });
        }
        console.log('[Itinerary] Hotel location set:', hotelCoords);
      }
    }

    // Add original items with coordinates
    if (itineraryRouteData.originalItems) {
      itineraryRouteData.originalItems.forEach((item: any) => {
        let coords: [number, number] | null = null;

        if (item.location?.lat && item.location?.lng) {
          coords = [item.location.lng, item.location.lat];
        } else if (item.latitude && item.longitude) {
          coords = [item.longitude, item.latitude];
        }

        if (coords) {
          const nameLower = item.name.toLowerCase();
          locationLookup.set(nameLower, coords);

          // Add multiple variants for better matching
          // Remove common words and add parts
          const cleanName = nameLower
            .replace(/^(the|a|an)\s+/i, '')
            .replace(/\s+(restaurant|cafe|bar|pub|grill|house|kitchen|tavern|bistro|eatery)$/i, '');
          locationLookup.set(cleanName, coords);

          // Add individual significant words
          const words = nameLower.split(/[\s\-,&]+/);
          words.forEach((word: string) => {
            if (word.length > 3 && !['the', 'and', 'for', 'with'].includes(word)) {
              locationLookup.set(word, coords!);
            }
          });

          // Add first two words combined
          if (words.length >= 2) {
            locationLookup.set(words.slice(0, 2).join(' '), coords);
          }
          if (words.length >= 3) {
            locationLookup.set(words.slice(0, 3).join(' '), coords);
          }
        }
      });
    }

    // Helper function to find location from step description
    const findLocation = (step: any): [number, number] | null => {
      const description = step.description || '';
      const details = step.details || '';
      const descLower = description.toLowerCase();
      const detailsLower = details.toLowerCase();

      // Check for hotel-related steps
      if (descLower.includes('hotel') || descLower.includes('check in') ||
        descLower.includes('check out') || descLower.includes('leave hotel') ||
        descLower.includes('return to hotel') || descLower.includes('arriving back') ||
        detailsLower.includes('hotel') || step.type === 'hotel') {
        const hotelCoords = locationLookup.get('hotel');
        if (hotelCoords) {
          console.log('[Itinerary] Matched hotel step:', description);
          return hotelCoords;
        }
      }

      // Extract place name from description patterns
      const extractPatterns = [
        /(?:visit|walk to|lunch at|dinner at|breakfast at|arrive at|explore|at)\s+(.+)/i,
        /(?:starting|arriving|from)\s+(?:the day from\s+)?(.+)/i,
      ];

      for (const pattern of extractPatterns) {
        const match = description.match(pattern);
        if (match) {
          const placeName = match[1].toLowerCase().trim();

          // Try exact match first
          if (locationLookup.has(placeName)) {
            console.log('[Itinerary] Exact match:', placeName);
            return locationLookup.get(placeName)!;
          }

          // Try partial matching
          for (const [name, coords] of locationLookup.entries()) {
            if (placeName.includes(name) || name.includes(placeName)) {
              console.log('[Itinerary] Partial match:', placeName, '->', name);
              return coords;
            }
          }

          // Try word-by-word matching
          const placeWords = placeName.split(/[\s\-,&]+/).filter((w: string) => w.length > 2);
          for (const word of placeWords) {
            if (locationLookup.has(word)) {
              console.log('[Itinerary] Word match:', word);
              return locationLookup.get(word)!;
            }
          }
        }
      }

      // Fallback: try direct description matching
      for (const [name, coords] of locationLookup.entries()) {
        if (descLower.includes(name)) {
          console.log('[Itinerary] Fallback match:', name);
          return coords;
        }
      }

      console.log('[Itinerary] No match found for:', description);
      return null;
    };

    // Determine transit color from step
    const getTransitColor = (step: any): string => {
      const routeInfo = (step.route_info || step.description || '').toLowerCase();

      for (const [key, color] of Object.entries(transitColors)) {
        if (routeInfo.includes(key)) {
          return color;
        }
      }

      return '#3b82f6'; // Default blue for unknown transit
    };

    // Generate GeoJSON features for routes and stops
    const routeFeatures: GeoJSON.Feature[] = [];
    const stopFeatures: GeoJSON.Feature[] = [];
    let stopNumber = 1;
    let lastLocation: [number, number] | null = null;
    let pendingTransit: { color: string; mode: string; routeInfo: string } | null = null;

    console.log('[Itinerary] Processing schedule with', schedule.length, 'steps');
    console.log('[Itinerary] Location lookup has', locationLookup.size, 'entries');

    schedule.forEach((step: any) => {
      // Handle transit steps - store for next location connection
      if (step.type === 'transit') {
        const mode = step.transport_mode || 'walking';
        const routeInfo = step.route_info || step.description || '';
        const color = mode === 'walking' ? '#10b981' : getTransitColor(step);

        pendingTransit = { color, mode, routeInfo };
        console.log('[Itinerary] Transit step:', mode, routeInfo, '-> color:', color);
        return;
      }

      // Non-transit step - find location
      const currentLocation = findLocation(step);

      if (currentLocation) {
        // Try to find matching original item for photo and details
        let photoName = '';
        let rating = 0;
        let address = '';
        let categories = '';

        const stepDesc = (step.description || '').toLowerCase();
        if (itineraryRouteData.originalItems) {
          const matchingItem = itineraryRouteData.originalItems.find((item: any) => {
            const itemName = (item.name || '').toLowerCase();
            return stepDesc.includes(itemName) || itemName.split(' ').some((w: string) =>
              w.length > 3 && stepDesc.includes(w)
            );
          });

          if (matchingItem) {
            photoName = matchingItem.photo_name || matchingItem.photoName || '';
            rating = matchingItem.rating || 0;
            address = matchingItem.address || '';
            categories = matchingItem.categories || matchingItem.vibe || '';
          }
        }

        // Add stop marker with enhanced data
        stopFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: currentLocation
          },
          properties: {
            stopNumber: stopNumber++,
            name: step.description || '',
            time: step.time || '',
            type: step.type,
            photoName,
            rating,
            address,
            categories
          }
        });

        // Add route line from last location
        if (lastLocation) {
          const isWalking = pendingTransit?.mode === 'walking' || !pendingTransit;
          const routeColor = pendingTransit?.color || '#10b981';

          routeFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [lastLocation, currentLocation]
            },
            properties: {
              mode: isWalking ? 'walking' : 'transit',
              routeInfo: pendingTransit?.routeInfo || '',
              routeColor: routeColor,
              duration: '',
              boardingTime: ''
            }
          });

          console.log('[Itinerary] Route:', isWalking ? 'walking' : pendingTransit?.routeInfo, 'color:', routeColor);
        }

        lastLocation = currentLocation;
        pendingTransit = null; // Reset pending transit
      }
    });

    // Update map sources
    if (mapInstance.getSource('itinerary-routes')) {
      (mapInstance.getSource('itinerary-routes') as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: routeFeatures
      });
    }

    if (mapInstance.getSource('itinerary-stops')) {
      (mapInstance.getSource('itinerary-stops') as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: stopFeatures
      });
    }

    // Show itinerary layers
    const hasItinerary = routeFeatures.length > 0 || stopFeatures.length > 0;
    setShowItinerary(hasItinerary);

    // When itinerary is active, hide all other layers to show ONLY the itinerary
    if (hasItinerary) {
      // Hide transit layers
      ['trails-glow', 'trails-core', 'trails-head', 'stops-glow', 'stops-marker',
        'glow-zone', 'trains-core', 'vehicles-glow', 'mbta-subway-3d',
        'ferry-body', 'ferry-label'].forEach(layer => {
          if (mapInstance.getLayer(layer)) {
            mapInstance.setLayoutProperty(layer, 'visibility', 'none');
          }
        });

      // Hide places/restaurants
      ['places-glow', 'places-marker', 'places-label'].forEach(layer => {
        if (mapInstance.getLayer(layer)) {
          mapInstance.setLayoutProperty(layer, 'visibility', 'none');
        }
      });

      // Hide events
      ['events-glow', 'events-marker', 'events-label'].forEach(layer => {
        if (mapInstance.getLayer(layer)) {
          mapInstance.setLayoutProperty(layer, 'visibility', 'none');
        }
      });

      // Hide landmarks
      ['landmarks-glow', 'landmarks-marker', 'landmarks-label'].forEach(layer => {
        if (mapInstance.getLayer(layer)) {
          mapInstance.setLayoutProperty(layer, 'visibility', 'none');
        }
      });

      // Show itinerary route layers (but NOT the stop markers - using Font Awesome instead)
      ['itinerary-walking-glow', 'itinerary-walking', 'itinerary-transit-glow', 'itinerary-transit-border',
        'itinerary-transit', 'itinerary-transit-center'].forEach(layer => {
          if (mapInstance.getLayer(layer)) {
            mapInstance.setLayoutProperty(layer, 'visibility', 'visible');
          }
        });
      
      // KEEP stop markers HIDDEN - we use Font Awesome markers instead
      ['itinerary-stops-glow', 'itinerary-stops-circle', 'itinerary-stops-highlight', 'itinerary-stops-icon',
        'itinerary-stops-number-bg', 'itinerary-stops-number', 'itinerary-stops-label'].forEach(layer => {
          if (mapInstance.getLayer(layer)) {
            mapInstance.setLayoutProperty(layer, 'visibility', 'none');
          }
        });

      console.log('[Itinerary] All other layers hidden - showing ONLY itinerary');
    }

    console.log('[Itinerary] Visualization updated:', routeFeatures.length, 'routes,', stopFeatures.length, 'stops');

    // Fit map to show all stops if there are any
    if (stopFeatures.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      stopFeatures.forEach((feature: any) => {
        bounds.extend(feature.geometry.coordinates);
      });
      mapInstance.fitBounds(bounds, {
        padding: 100,
        duration: 1000,
        maxZoom: 14
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraryRouteData, selectedItineraryDay, isLoaded, onRouteCalculated]);

  // Handle Search Results Markers
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    const mapInstance = map.current;

    // Clear existing markers
    activeSearchMarkers.forEach(m => m.remove());
    setActiveSearchMarkers([]);

    // If we have an active itinerary, don't show search markers
    if (itineraryRouteData) return;

    if (!searchResults || !searchResults.features || searchResults.features.length === 0) return;

    console.log('[Map3D] Displaying', searchResults.features.length, 'search markers');
    const newMarkers: mapboxgl.Marker[] = [];
    const bounds = new mapboxgl.LngLatBounds();

    searchResults.features.forEach((feature) => {
      const coords = feature.geometry.coordinates as [number, number];
      const props = feature.properties;
      const [lng, lat] = coords;

      // Create a custom element for the marker
      const el = document.createElement('div');
      el.className = `search-marker search-marker-${props.type}`;
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';

      const typeColors: Record<string, string> = {
        restaurant: '#ec4899',
        event: '#8b5cf6',
        landmark: '#ef4444'
      };
      el.style.backgroundColor = typeColors[props.type] || '#3b82f6';

      const typeIcons: Record<string, string> = {
        restaurant: '🍴',
        event: '📅',
        landmark: '🏛️'
      };
      el.innerHTML = `<span style="font-size: 16px;">${typeIcons[props.type] || '📍'}</span>`;

      // Add click handler for rich popup with photo fetching
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        const itemType = props.type === 'restaurant' ? 'restaurant' : props.type === 'event' ? 'event' : 'landmark';
        const typeLabel = props.type === 'restaurant' ? 'Restaurant' : props.type === 'event' ? 'Event' : 'Landmark';
        const typeBgColor = props.type === 'restaurant' ? '#ec4899' : props.type === 'event' ? '#8b5cf6' : '#ef4444';
        
        // Show loading popup first
        const loadingPopup = new mapboxgl.Popup({ maxWidth: '320px', className: 'search-popup-container' })
          .setLngLat([lng, lat])
          .setHTML(`
            <div style="padding: 20px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
              <h3 style="margin: 0 0 10px 0; font-size: 16px; font-weight: 700; color: #000;">${props.name}</h3>
              <div style="color: #666;">Loading details...</div>
            </div>
          `)
          .addTo(mapInstance);

        // Try to fetch photo from Google Places API
        let photoUrl = '';
        let googleRating = props.rating || 0;
        let googleAddress = props.address || '';

        if (GOOGLE_MAPS_API_KEY) {
          try {
            const searchQuery = encodeURIComponent(`${props.name} NYC`);
            const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${searchQuery}&inputtype=textquery&fields=place_id,photos,rating,formatted_address&key=${GOOGLE_MAPS_API_KEY}`;
            
            const proxyUrl = `${API_BASE_URL}/api/proxy/places?url=${encodeURIComponent(findPlaceUrl)}`;
            const response = await fetch(proxyUrl);
            const data = await response.json();
            
            if (data.candidates && data.candidates[0]) {
              const place = data.candidates[0];
              if (place.photos && place.photos[0]) {
                photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${GOOGLE_MAPS_API_KEY}`;
              }
              if (place.rating) googleRating = place.rating;
              if (place.formatted_address) googleAddress = place.formatted_address;
            }
          } catch (err) {
            console.log('[Search Popup] Photo fetch failed:', err);
          }
        }

        const rating = googleRating;
        const address = googleAddress || props.address || 'NYC';
        const description = props.description || '';
        const isAlreadySaved = savedItemIdsRef.current.includes(props.id);

        // Generate star rating
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        let starsHTML = '';
        for (let i = 0; i < 5; i++) {
          if (i < fullStars) starsHTML += '★';
          else if (i === fullStars && hasHalfStar) starsHTML += '½';
          else starsHTML += '☆';
        }

        // Build popup HTML
        const popupHTML = `
          <div class="search-popup" style="min-width: 280px; max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
            ${photoUrl ? `
              <div style="width: 100%; height: 140px; background: linear-gradient(135deg, ${typeBgColor}40 0%, ${typeBgColor}20 100%); border-radius: 8px 8px 0 0; margin: -16px -16px 12px -16px; position: relative; overflow: hidden;">
                <img src="${photoUrl}" alt="${props.name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none';" />
                ${rating > 0 ? `<div style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.95); padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 700;">
                  <span style="color: #f59e0b;">${starsHTML}</span> ${rating.toFixed(1)}
                </div>` : ''}
              </div>
            ` : ''}
            
            <div style="padding: ${photoUrl ? '0' : '0'};">
              <div style="display: inline-block; padding: 4px 10px; background: ${typeBgColor}; color: #fff; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px;">
                ${typeLabel}
              </div>
              
              <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #000; line-height: 1.3;">
                ${props.name}
              </h3>
              
              ${!photoUrl && rating > 0 ? `
                <div style="margin: 8px 0; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #f59e0b;">${starsHTML}</span>
                  <span style="font-size: 14px; font-weight: 700;">${rating.toFixed(1)}</span>
                </div>
              ` : ''}
              
              <div style="margin: 8px 0; display: flex; align-items: start; gap: 8px;">
                <span style="font-size: 14px;">📍</span>
                <span style="font-size: 13px; color: #4a4a4a; line-height: 1.4;">${address}</span>
              </div>
              
              ${description ? `
                <div style="margin: 10px 0; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                  ${description}
                </div>
              ` : ''}
              
              ${props.category ? `
                <div style="margin: 10px 0;">
                  <span style="display: inline-block; padding: 4px 10px; background: #f3f4f6; border-radius: 4px; font-size: 11px; color: #374151; font-weight: 600;">${props.category}</span>
                  ${props.price ? `<span style="margin-left: 8px; font-size: 13px; color: #059669; font-weight: 600;">${props.price}</span>` : ''}
                </div>
              ` : ''}
              
              <div style="margin-top: 14px; padding-top: 14px; border-top: 2px solid #e5e7eb;">
                <button 
                  onclick="window.addToItinerary && window.addToItinerary('${props.id}', '${(props.name || '').replace(/'/g, "\\'")}', '${itemType}', '${(description || '').replace(/'/g, "\\'")}', '${(address || '').replace(/'/g, "\\'")}', '${props.price || ''}', ${lat}, ${lng})"
                  style="width: 100%; text-align: center; padding: 12px 14px; background: ${isAlreadySaved ? '#22c55e' : `linear-gradient(135deg, ${typeBgColor}, ${typeBgColor}dd)`}; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: ${isAlreadySaved ? 'default' : 'pointer'}; margin-bottom: 8px;"
                  ${isAlreadySaved ? 'disabled' : ''}
                >
                  ${isAlreadySaved ? '✓ Added to Itinerary' : '+ Add to Itinerary'}
                </button>
                <div style="display: flex; gap: 8px;">
                  <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.name + ' ' + address)}" 
                     target="_blank" 
                     style="flex: 1; text-align: center; padding: 10px 14px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700;">
                    Directions
                  </a>
                  <a href="https://www.google.com/search?q=${encodeURIComponent(props.name + ' NYC')}" 
                     target="_blank" 
                     style="flex: 1; text-align: center; padding: 10px 14px; background: #fff; color: #000; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 2px solid #000;">
                    More Info
                  </a>
                </div>
              </div>
            </div>
          </div>
        `;

        // Remove loading popup and show final popup
        loadingPopup.remove();

        new mapboxgl.Popup({ maxWidth: '340px', className: 'search-popup-container' })
          .setLngLat([lng, lat])
          .setHTML(popupHTML)
          .addTo(mapInstance);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .addTo(mapInstance);

      newMarkers.push(marker);
      bounds.extend([lng, lat]);
    });

    setActiveSearchMarkers(newMarkers);

    // Filter out obvious out-of-bounds coords (like 0,0) before fitting
    if (newMarkers.length > 0) {
      mapInstance.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15,
        duration: 1500
      });
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResults, isLoaded]);

  // 2D/3D mode toggle
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    map.current.easeTo({
      pitch: is3DMode ? 65 : 0,
      duration: 800
    });
  }, [is3DMode, isLoaded]);

  // Light mode 3D map - no toggle needed
  // Map style is set to light-v11 in initialization

  // Cinematic flyTo when location is selected from itinerary
  useEffect(() => {
    if (!map.current || !isLoaded || !selectedLocation) return;

    const { location } = selectedLocation;

    // Cinematic camera movement
    map.current.flyTo({
      center: location,
      zoom: 17,
      pitch: 70,
      bearing: 45,
      duration: 2500,
      essential: true,
      easing: (t) => t * (2 - t), // Ease out quad for smooth deceleration
    });

    // Add a temporary marker at the selected location
    if (map.current.getSource('selected-location-marker')) {
      (map.current.getSource('selected-location-marker') as mapboxgl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: location
          },
          properties: {
            name: selectedLocation.name
          }
        }]
      });
    } else {
      map.current.addSource('selected-location-marker', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: location
            },
            properties: {
              name: selectedLocation.name
            }
          }]
        }
      });

      // Add marker layer if it doesn't exist
      if (!map.current.getLayer('selected-location-marker-core')) {

        map.current.addLayer({
          id: 'selected-location-marker-core',
          type: 'circle',
          source: 'selected-location-marker',
          paint: {
            'circle-radius': 3,
            'circle-color': '#000000',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2
          }
        });
      }
    }

  }, [selectedLocation, isLoaded]);

  // Handle voice-controlled map commands
  useEffect(() => {
    if (!map.current || !isLoaded || !mapCommand) return;

    console.log('[Map3D] Executing map command:', mapCommand.action, mapCommand.location);

    if (mapCommand.action === 'zoom_in') {
      map.current.zoomIn({ duration: 500 });
    } else if (mapCommand.action === 'zoom_out') {
      map.current.zoomOut({ duration: 500 });
    } else if (mapCommand.action === 'fly_to' && mapCommand.location) {
      // Known Boston neighborhoods/areas
      const bostonLocations: Record<string, [number, number]> = {
        'chinatown': [-71.0612, 42.3513],
        'back bay': [-71.0815, 42.3503],
        'beacon hill': [-71.0686, 42.3588],
        'north end': [-71.0544, 42.3647],
        'south end': [-71.0724, 42.3414],
        'fenway': [-71.0972, 42.3467],
        'seaport': [-71.0389, 42.3488],
        'downtown': [-71.0589, 42.3601],
        'cambridge': [-71.1097, 42.3736],
        'harvard': [-71.1167, 42.3770],
        'mit': [-71.0921, 42.3601],
        'south boston': [-71.0389, 42.3388],
        'dorchester': [-71.0574, 42.3016],
        'roxbury': [-71.0853, 42.3126],
        'jamaica plain': [-71.1156, 42.3097],
        'allston': [-71.1327, 42.3539],
        'brighton': [-71.1566, 42.3489],
        'charlestown': [-71.0628, 42.3782],
        'east boston': [-71.0247, 42.3751],
        'financial district': [-71.0561, 42.3555],
        'theater district': [-71.0636, 42.3519],
        'waterfront': [-71.0503, 42.3592],
        'faneuil hall': [-71.0568, 42.3601],
        'boston common': [-71.0636, 42.3554],
        'public garden': [-71.0697, 42.3541],
        'prudential': [-71.0819, 42.3470],
        'copley': [-71.0775, 42.3499],
        'newbury street': [-71.0785, 42.3510],
      };

      const locationKey = mapCommand.location.toLowerCase();
      let targetCoords: [number, number] | null = null;

      // Check for exact match first
      if (bostonLocations[locationKey]) {
        targetCoords = bostonLocations[locationKey];
      } else {
        // Check for partial match
        for (const [key, coords] of Object.entries(bostonLocations)) {
          if (locationKey.includes(key) || key.includes(locationKey)) {
            targetCoords = coords;
            break;
          }
        }
      }

      if (targetCoords) {
        console.log('[Map3D] Flying to:', locationKey, targetCoords);
        map.current.flyTo({
          center: targetCoords,
          zoom: 16,
          pitch: 60,
          bearing: 30,
          duration: 2000,
          essential: true,
        });
      } else {
        console.log('[Map3D] Unknown location:', mapCommand.location);
        // Default: zoom in slightly on current view
        map.current.zoomIn({ duration: 500 });
      }
    }
  }, [mapCommand, isLoaded]);

  // ===========================================
  // EXPAND MAP TOGGLE - Cinematic Fullscreen
  // ===========================================
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExpandToggle = useCallback(() => {
    setIsExpanded(prev => {
      const newExpanded = !prev;

      if (map.current) {
        if (newExpanded) {
          // Worcester-Boston corridor view (45° pitch for better visibility)
          map.current.easeTo({
            center: [-71.35, 42.34], // Centered between Worcester and Boston
            pitch: 45,  // Reduced from 75° per architect feedback
            zoom: 10.5, // Wider to show corridor
            bearing: 70, // Align Worcester-Boston axis vertically
            duration: 1200,
          });
        } else {
          // Return to NYC downtown view
          map.current.easeTo({
            center: NYC_CENTER,
            pitch: 60,
            zoom: 14,
            bearing: -17,
            duration: 800,
          });
        }

        // Resize map after CSS transition
        setTimeout(() => {
          map.current?.resize();
        }, 550);
      }

      return newExpanded;
    });
  }, []);

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="map-container" />

      {/* Layer Toggle Controls */}
      <div className="layer-toggle-controls">
        <button
          className={`layer-toggle-btn ${activeLayer === 'transit' ? 'active' : ''}`}
          onClick={() => setActiveLayer(activeLayer === 'transit' ? null : 'transit')}
          title="Toggle Transit"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M3 10h18M7 14h.01M17 14h.01M7 18h10" />
          </svg>
          <span>Transit</span>
        </button>

        <button
          className={`layer-toggle-btn ${activeLayer === 'restaurants' ? 'active' : ''}`}
          onClick={() => setActiveLayer(activeLayer === 'restaurants' ? null : 'restaurants')}
          title="Toggle Restaurants"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
          </svg>
          <span>Restaurants</span>
        </button>

        <button
          className={`layer-toggle-btn ${activeLayer === 'events' ? 'active' : ''}`}
          onClick={() => setActiveLayer(activeLayer === 'events' ? null : 'events')}
          title="Toggle Events"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>Events</span>
        </button>

        <button
          className={`layer-toggle-btn ${activeLayer === 'landmarks' ? 'active' : ''}`}
          onClick={() => setActiveLayer(activeLayer === 'landmarks' ? null : 'landmarks')}
          title="Toggle Landmarks"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
          </svg>
          <span>Landmarks</span>
        </button>
      </div>
    </div>
  );
}
