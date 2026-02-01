import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CitySettings } from '../App';
// NYC Data
import nycRoutes from '../data/nycSubwayRoutes.json';
import nycStations from '../data/nycSubwayStations.json';
import { fetchLandmarks, landmarksToGeoJSON } from '../services/landmarksApi';
import { fetchNYCRestaurants, nycRestaurantsToGeoJSON } from '../services/restaurantApi';
import { fetchEvents, eventsToGeoJSON } from '../services/eventsApi';
import { fetchAllMTAFeeds, MTAEntity, fetchLineStatuses, LineStatusMap } from '../services/mtaApi';
import './Map3D.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "";

interface Map3DProps {
  settings: CitySettings;
  selectedLocation?: { location: [number, number]; name: string } | null;
  mapCommand?: {
    action: 'zoom_in' | 'zoom_out' | 'fly_to';
    location?: string;
    timestamp: number;
  } | null;
  itineraryRouteData?: any;
  onRouteCalculated?: (routeInfo: { totalDuration: number; segments: Array<{ mode: string; duration: number }> }) => void;
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

export default function Map3D({ settings, selectedLocation, mapCommand, itineraryRouteData, onRouteCalculated }: Map3DProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const animationRef = useRef<number | null>(null);
  const mbtaIntervalRef = useRef<number | null>(null);

  const pulsePhaseRef = useRef(0);
  const selectedBuildingRef = useRef<string | null>(null);

  // Real-time Line Status (MTA)
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
  const vehicleLerpRef = useRef<Map<string, any>>(new Map());


  const [isLoaded, setIsLoaded] = useState(false);
  // MBTA state removed

  const [systemStress, setSystemStress] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeLayer, setActiveLayer] = useState<'transit' | 'restaurants' | 'events' | 'landmarks' | null>(null);
  const [is3DMode, setIs3DMode] = useState(true);
  
  // Derived state from activeLayer for compatibility
  const showPlaces = activeLayer === 'restaurants';
  const showTransitLayers = activeLayer === 'transit';
  const showEvents = activeLayer === 'events';
  const showLandmarks = activeLayer === 'landmarks';
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [selectedItineraryDay, setSelectedItineraryDay] = useState(0);
  const [showItinerary, setShowItinerary] = useState(false);

  // Generate vascular light trail segments with speed-linked pulse
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
          <div class="event-popup" style="min-width: 280px; max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
            
            ${photoUrl ? `<div class="popup-photo" style="width: 100%; height: 140px; background: linear-gradient(135deg, #1a1a1a 0%, #4a4a4a 100%); border-radius: 8px 8px 0 0; margin: -5px -16px 12px -16px; position: relative; overflow: hidden;">
              <img src="${photoUrl}" style="width: 100%; height: 100%; object-fit: cover;" 
                onerror="this.parentElement.style.height='0'; this.parentElement.style.margin='0';" />
            </div>` : ''}

            <div style="padding: 4px 0;">
              <div style="display: inline-block; padding: 5px 12px; background: #000; color: #fff; border-radius: 5px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;">
                Event
              </div>
              
              <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #000; line-height: 1.3; letter-spacing: -0.3px;">
                ${props.title}
              </h3>
              
              <div style="margin: 12px 0; display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 15px;">📅</span>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <span style="font-size: 14px; color: #000; font-weight: 700;">${startDate}</span>
                  <span style="font-size: 12px; color: #666; font-weight: 500;">${startTime} - ${endTime}</span>
                </div>
              </div>
              
              <div style="margin: 12px 0; display: flex; align-items: start; gap: 10px;">
                <span style="font-size: 15px; color: #000; margin-top: 2px;">📍</span>
                <span style="font-size: 13px; color: #000; font-weight: 600; line-height: 1.5;">${props.venueName}</span>
              </div>
              
              ${props.description ? `<div style="margin: 14px 0; padding: 12px; background: #fafafa; border-radius: 6px; border-left: 3px solid #000;">
                <div style="font-size: 13px; color: #1a1a1a; line-height: 1.6; font-weight: 500;">
                  ${props.description.substring(0, 150)}${props.description.length > 150 ? '...' : ''}
                </div>
              </div>` : ''}
              
              ${props.price && props.price !== 'Free' ? `<div style="margin: 12px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Price:</span>
                <span style="font-size: 14px; color: #000; font-weight: 700;">${props.price}</span>
              </div>` : props.price === 'Free' ? `<div style="margin: 12px 0;">
                <span style="display: inline-block; padding: 4px 10px; background: #f0f0f0; color: #000; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px;">FREE EVENT</span>
              </div>` : ''}
              
              ${props.sourceUrl ? `<div style="margin-top: 16px; padding-top: 16px; border-top: 2px solid #e5e7eb;">
                <a href="${props.sourceUrl}" target="_blank" style="display: block; text-align: center; padding: 11px 16px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700; transition: all 0.2s; letter-spacing: 0.5px;">
                  View Details
                </a>
              </div>` : ''}
            </div>
          </div>
        `;

        new mapboxgl.Popup({ maxWidth: '340px', className: 'event-popup-container' })
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

      // Walking paths - animated dashed line with glow
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
          'line-color': ['coalesce', ['get', 'routeColor'], '#10b981'],
          'line-width': 14,
          'line-blur': 6,
          'line-opacity': 0.4,
        },
      });

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
          'line-color': ['coalesce', ['get', 'routeColor'], '#10b981'],
          'line-width': 6,
          'line-dasharray': [0.5, 1.5],
          'line-opacity': 1,
        },
      });

      // Transit paths - thick solid lines with MTA colors
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
          'line-color': ['coalesce', ['get', 'routeColor'], '#EE352E'],
          'line-width': 18,
          'line-blur': 6,
          'line-opacity': 0.5,
        },
      });

      // Transit paths - solid thick line with subway color
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
          'line-color': ['coalesce', ['get', 'routeColor'], '#EE352E'],
          'line-width': 8,
          'line-opacity': 1,
        },
      });
      
      // Transit center line (white stripe for subway look)
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
          'line-width': 2,
          'line-opacity': 0.3,
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
        const stopTime = props.time || '';
        const stopType = props.type || 'visit';
        const stopNumber = props.stopNumber || '';

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
          } catch (err) {
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

        // Build rating stars
        const rating = googleRating || 0;
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        let starsHTML = '';
        for (let i = 0; i < 5; i++) {
          if (i < fullStars) {
            starsHTML += '<span style="color: #000;">★</span>';
          } else if (i === fullStars && hasHalfStar) {
            starsHTML += '<span style="color: #000;">⯨</span>';
          } else {
            starsHTML += '<span style="color: #d1d5db;">★</span>';
          }
        }

        // Get category icon
        const categoryIcon = (() => {
          const cat = (props.category || '').toLowerCase();
          if (cat.includes('historic')) return '🏛️';
          if (cat.includes('museum')) return '🎨';
          if (cat.includes('park')) return '🌳';
          if (cat.includes('monument')) return '🗽';
          if (cat.includes('scenic')) return '🌅';
          if (cat.includes('residential')) return '🏠';
          return '📍';
        })();

        // Photo section
        const photoHTML = photoUrl ?
          `<div class="popup-photo" style="width: 100%; height: 140px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); border-radius: 8px 8px 0 0; margin: -16px -16px 12px -16px; position: relative; overflow: hidden;">
            <img src="${photoUrl}" 
                 alt="${props.name}"
                 style="width: 100%; height: 100%; object-fit: cover;"
                 onerror="this.parentElement.style.background='linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)'; this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center;">
              <span style="font-size: 48px;">${categoryIcon}</span>
            </div>
            ${rating > 0 ? `<div style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); padding: 5px 10px; border-radius: 6px; font-size: 12px; color: #000; font-weight: 700; border: 1px solid #e5e7eb;">
              ${starsHTML} <span style="margin-left: 4px;">${rating.toFixed(1)}</span>
            </div>` : ''}
          </div>` :
          `<div class="popup-photo-placeholder" style="width: 100%; height: 120px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); border-radius: 8px 8px 0 0; margin: -16px -16px 12px -16px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 48px;">${categoryIcon}</span>
          </div>`;

        // Address line
        const address = googleAddress || (props.neighborhood ? `${props.neighborhood}, ${props.borough}` : props.borough || 'NYC');

        // Description
        const description = props.description || '';

        // Tags
        const tags = props.tags ? props.tags.split(',').map((t: string) => t.trim()).slice(0, 4) : [];
        const tagBadges = tags.map((tag: string) => `<span style="display: inline-block; padding: 4px 8px; background: #f3e8ff; color: #7c3aed; border-radius: 4px; font-size: 11px; font-weight: 600;">${tag}</span>`).join('');

        // Build popup HTML
        const popupHTML = `
          <div class="landmark-popup" style="min-width: 280px; max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
            ${photoHTML}
            
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="display: inline-block; padding: 4px 10px; background: #8b5cf6; color: #fff; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${props.category || 'Landmark'}
                </span>
              </div>
              
              <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #000; line-height: 1.3;">
                ${props.name}
              </h3>
              
              <div style="margin: 8px 0; display: flex; align-items: start; gap: 8px;">
                <span style="font-size: 14px; color: #000; margin-top: 1px;">📍</span>
                <span style="font-size: 13px; color: #000; font-weight: 500; line-height: 1.4;">${address}</span>
              </div>
              
              ${description ? `
                <div style="margin: 10px 0; font-size: 13px; color: #4a4a4a; line-height: 1.5;">
                  ${description}
                </div>
              ` : ''}
              
              ${props.bestTime ? `
                <div style="margin: 8px 0; font-size: 12px; color: #666;">
                  <strong>Best time:</strong> ${props.bestTime}
                </div>
              ` : ''}
              
              ${props.proTip ? `
                <div style="margin: 8px 0; padding: 8px 10px; background: #fef3c7; border-radius: 6px; font-size: 12px; color: #92400e;">
                  💡 <strong>Pro tip:</strong> ${props.proTip}
                </div>
              ` : ''}
              
              ${tagBadges ? `
                <div style="margin: 10px 0; display: flex; flex-wrap: wrap; gap: 6px;">
                  ${tagBadges}
                </div>
              ` : ''}
              
              <div style="margin-top: 14px; padding-top: 14px; border-top: 2px solid #e5e7eb; display: flex; gap: 8px;">
                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.name + ' ' + address)}" 
                   target="_blank" 
                   style="flex: 1; text-align: center; padding: 10px 14px; background: #8b5cf6; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700; transition: all 0.2s; letter-spacing: 0.3px;">
                  Get Directions
                </a>
                <a href="https://www.google.com/search?q=${encodeURIComponent(props.name + ' NYC landmark')}" 
                   target="_blank" 
                   style="flex: 1; text-align: center; padding: 10px 14px; background: #fff; color: #8b5cf6; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700; border: 2px solid #8b5cf6; transition: all 0.2s; letter-spacing: 0.3px;">
                  Learn More
                </a>
              </div>
            </div>
          </div>
        `;

        // Remove loading popup and show final popup
        loadingPopup.remove();

        new mapboxgl.Popup({ maxWidth: '320px', className: 'landmark-popup-container' })
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
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        let starsHTML = '';
        for (let i = 0; i < 5; i++) {
          if (i < fullStars) {
            starsHTML += '<span style="color: #000;">★</span>';
          } else if (i === fullStars && hasHalfStar) {
            starsHTML += '<span style="color: #000;">⯨</span>';
          } else {
            starsHTML += '<span style="color: #d1d5db;">★</span>';
          }
        }

        // Price level
        const priceRange = props.priceRange || '';
        const priceHTML = priceRange ? `<span style="color: #000; font-weight: 700; font-size: 14px;">${priceRange}</span>` : '';

        // Tags/cuisine badges
        const tags = props.tags ? props.tags.split(',').map((t: string) => t.trim()).slice(0, 4) : [];
        const cuisineBadge = props.cuisine ? `<span class="badge" style="background: #000; color: #fff;">${props.cuisine}</span>` : '';
        const tagBadges = tags.map((tag: string) => `<span class="badge">${tag}</span>`).join('');

        // Photo section
        const photoHTML = photoUrl ?
          `<div class="popup-photo" style="width: 100%; height: 140px; background: linear-gradient(135deg, #1a1a1a 0%, #4a4a4a 100%); border-radius: 8px 8px 0 0; margin: -16px -16px 12px -16px; position: relative; overflow: hidden;">
            <img src="${photoUrl}" 
                 alt="${props.name}"
                 style="width: 100%; height: 100%; object-fit: cover;"
                 onerror="this.parentElement.style.background='linear-gradient(135deg, #1a1a1a 0%, #4a4a4a 100%)'; this.style.display='none';" />
            <div style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); padding: 5px 10px; border-radius: 6px; font-size: 12px; color: #000; font-weight: 700; border: 1px solid #e5e7eb;">
              ${starsHTML} <span style="margin-left: 4px;">${rating.toFixed(1)}</span>
            </div>
          </div>`
          : '';

        // Address line
        const address = googleAddress || (props.neighborhood ? `${props.neighborhood}, ${props.borough}` : props.borough || 'NYC');

        // Description
        const description = props.description || '';

        // Generate place insight
        const insightHTML = generatePlaceInsightHTML({
          name: props.name,
          address: address,
          rating: rating
        });

        // Build popup HTML
        const popupHTML = `
          <div class="place-popup" style="min-width: 280px; max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
            ${photoHTML}
            
            <div style="padding: ${photoHTML ? '0' : '0'};">
              <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #000; line-height: 1.3; letter-spacing: -0.3px;">
                ${props.name}
              </h3>
              
              ${!photoHTML ? `
                <div style="margin: 8px 0; display: flex; align-items: center; gap: 8px;">
                  <div style="font-size: 14px; line-height: 1;">${starsHTML}</div>
                  <span style="font-size: 14px; font-weight: 700; color: #000;">${rating > 0 ? rating.toFixed(1) : 'New'}</span>
                  ${priceHTML ? `<span style="margin-left: auto;">${priceHTML}</span>` : ''}
                </div>
              ` : ''}
              
              <div style="margin: 8px 0; display: flex; align-items: start; gap: 8px;">
                <span style="font-size: 14px; color: #000; margin-top: 1px;">📍</span>
                <span style="font-size: 13px; color: #000; font-weight: 500; line-height: 1.4;">${address}</span>
              </div>
              
              ${description ? `
                <div style="margin: 10px 0; font-size: 13px; color: #4a4a4a; line-height: 1.5; font-style: italic;">
                  "${description}"
                </div>
              ` : ''}
              
              ${cuisineBadge || tagBadges ? `
                <div style="margin: 10px 0; display: flex; flex-wrap: wrap; gap: 6px;">
                  ${cuisineBadge}
                  ${tagBadges}
                </div>
              ` : ''}
              
              ${insightHTML}
              
              <div style="margin-top: 14px; padding-top: 14px; border-top: 2px solid #e5e7eb; display: flex; gap: 8px;">
                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.name + ' ' + address)}" 
                   target="_blank" 
                   style="flex: 1; text-align: center; padding: 10px 14px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700; transition: all 0.2s; letter-spacing: 0.3px;">
                  Directions
                </a>
                <a href="https://www.google.com/search?q=${encodeURIComponent(props.name + ' NYC')}" 
                   target="_blank" 
                   style="flex: 1; text-align: center; padding: 10px 14px; background: #fff; color: #000; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700; border: 2px solid #000; transition: all 0.2s; letter-spacing: 0.3px;">
                  More Info
                </a>
              </div>
            </div>
          </div>
          
          <style>
            .badge {
              display: inline-block;
              padding: 5px 10px;
              background: #f5f5f5;
              color: #000;
              border-radius: 5px;
              font-size: 11px;
              font-weight: 600;
              border: 1.5px solid #d1d5db;
              letter-spacing: 0.2px;
            }
            .place-popup a:hover {
              transform: translateY(-1px);
              box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
            .place-popup a:active {
              transform: translateY(0);
            }
          </style>
        `;

        // Remove loading popup and show final popup
        loadingPopup.remove();

        new mapboxgl.Popup({ maxWidth: '340px', className: 'place-popup-container' })
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
      } catch (error) {
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

  // Place visibility toggle
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    const vis = showPlaces ? 'visible' : 'none';
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
  }, [showPlaces, isLoaded]);

  // Events visibility toggle
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    const vis = showEvents ? 'visible' : 'none';
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
  }, [showEvents, isLoaded]);

  // Landmarks visibility toggle
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    const vis = showLandmarks ? 'visible' : 'none';
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
  }, [showLandmarks, isLoaded]);

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
        ['itinerary-walking-glow', 'itinerary-walking', 'itinerary-transit-glow',
          'itinerary-transit', 'itinerary-stops-circle', 'itinerary-stops-icon',
          'itinerary-stops-number-bg', 'itinerary-stops-number', 'itinerary-stops-label'].forEach(layer => {
            if (map.current?.getLayer(layer)) {
              map.current.setLayoutProperty(layer, 'visibility', 'none');
            }
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

      // Show stop layers immediately - including new glow and highlight layers
      ['itinerary-stops-glow', 'itinerary-stops-circle', 'itinerary-stops-highlight', 'itinerary-stops-icon', 
       'itinerary-stops-number-bg', 'itinerary-stops-number', 'itinerary-stops-label'].forEach(layer => {
        if (mapInstance.getLayer(layer)) {
          mapInstance.setLayoutProperty(layer, 'visibility', 'visible');
        }
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
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1) * Math.cos(lat2) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
                const walkMin = Math.round(walkToStation.duration / 60);
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
          ['itinerary-walking-glow', 'itinerary-walking', 'itinerary-transit-glow', 'itinerary-transit', 'itinerary-transit-center'].forEach(layer => {
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

    schedule.forEach((step: any, idx: number) => {
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

      // Show itinerary layers
      ['itinerary-walking-glow', 'itinerary-walking', 'itinerary-transit-glow',
        'itinerary-transit', 'itinerary-stops-circle', 'itinerary-stops-icon',
        'itinerary-stops-number-bg', 'itinerary-stops-number', 'itinerary-stops-label'].forEach(layer => {
          if (mapInstance.getLayer(layer)) {
            mapInstance.setLayoutProperty(layer, 'visibility', 'visible');
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
  }, [itineraryRouteData, selectedItineraryDay, isLoaded, onRouteCalculated]);

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
  // ===========================================
  // EXPAND MAP TOGGLE - Cinematic Fullscreen
  // ===========================================
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
