import { useState, useCallback } from 'react';
import Map3D from './components/Map3D';
import MapErrorBoundary from './components/MapErrorBoundary';
import MapOverlayUI from './components/map-overlay/MapOverlayUI';
import WelcomeScreen from './components/WelcomeScreen';
import { ItineraryEvent } from './types';
import { ItineraryItem, BudgetData } from './components/map-overlay';
import './App.css';
import './styles/industrial.css';

export interface CitySettings {
  timeOfDay: number;
  weather: 'clear' | 'rain' | 'snow' | 'fog';
  fogDensity: number;
  buildingGlow: number;
  trafficDensity: number;
  cameraMode: 'free' | 'helicopter' | 'street' | 'drone' | 'cinematic';
  showTransit: boolean;
  showStreetLights: boolean;
  glitchEffect: boolean;
  neonMode: boolean;
}

export interface TripDates {
  startDate: string;
  endDate: string;
  specifyTimes: boolean;
  arrivalTime: string;
  leaveTime: string;
}

export interface WalkingPreferences {
  walkingTimeMinutes: number;
  walkingDistanceMiles: number;
}

// Convert ItineraryEvent to ItineraryItem for the overlay UI
function eventToOverlayItem(event: ItineraryEvent, index: number): ItineraryItem {
  const typeConfig: Record<string, { icon: string; iconBg: string }> = {
    restaurant: { icon: 'fa-utensils', iconBg: '#ec4899' },
    event: { icon: 'fa-calendar', iconBg: '#8b5cf6' },
    landmark: { icon: 'fa-landmark', iconBg: '#ef4444' },
    transit: { icon: 'fa-train-subway', iconBg: '#3b82f6' },
    attraction: { icon: 'fa-star', iconBg: '#f97316' },
  };

  const config = typeConfig[event.type] || typeConfig.attraction;

  return {
    id: event.id,
    type: event.type as ItineraryItem['type'],
    name: event.name,
    duration: event.duration ? `${event.duration} min` : undefined,
    price: event.price ? `$${event.price}` : undefined,
    icon: config.icon,
    iconBg: config.iconBg,
    address: event.address,
    description: event.description,
    rating: event.rating,
    tags: event.tags,
  };
}

function App() {
  const [showWelcome, setShowWelcome] = useState(false); // Disabled for testing new UI
  const [voiceOnboardingActive, setVoiceOnboardingActive] = useState(false);

  const [settings] = useState<CitySettings>({
    timeOfDay: 20,
    weather: 'clear',
    fogDensity: 0.5,
    buildingGlow: 0.8,
    trafficDensity: 0.6,
    cameraMode: 'free',
    showTransit: true,
    showStreetLights: true,
    glitchEffect: false,
    neonMode: true,
  });

  const [selectedLocation, setSelectedLocation] = useState<{
    location: [number, number];
    name: string;
  } | null>(null);

  // Itinerary State
  const [itineraryEvents, setItineraryEvents] = useState<ItineraryEvent[]>([]);
  
  // Budget state
  const [budget] = useState<BudgetData>({
    food: 0,
    activity: 0,
    transit: 0,
  });

  // Map control state for voice commands
  const [mapCommand, setMapCommand] = useState<{
    action: 'zoom_in' | 'zoom_out' | 'fly_to';
    location?: string;
    timestamp: number;
  } | null>(null);

  // Itinerary route data for map visualization
  const [itineraryRouteData, setItineraryRouteData] = useState<any>(null);

  const handleDisplayStart = useCallback((mode: 'voice' | 'chat') => {
    setShowWelcome(false);

    // If voice mode, activate voice onboarding  
    if (mode === 'voice') {
      setVoiceOnboardingActive(true);
    }
  }, []);

  const handleSearch = useCallback((query: string) => {
    console.log('[App] Search query:', query);
    // TODO: Implement search functionality
  }, []);

  const handleVoiceClick = useCallback(() => {
    console.log('[App] Voice button clicked');
    setVoiceOnboardingActive(true);
  }, []);

  const handleNavClick = useCallback((nav: 'places' | 'landmarks' | 'settings') => {
    console.log('[App] Nav clicked:', nav);
    // TODO: Implement nav switching
  }, []);

  const handleItemClick = useCallback((item: ItineraryItem) => {
    console.log('[App] Item clicked:', item);
    // TODO: Fly to item on map
  }, []);

  // Convert itinerary events to overlay items
  const overlayItems: ItineraryItem[] = itineraryEvents.map(eventToOverlayItem);

  // Calculate total budget
  const totalBudget = budget.food + budget.activity + budget.transit;

  if (showWelcome) {
    return <WelcomeScreen onStart={handleDisplayStart} />;
  }

  return (
    <div className="app-fullscreen">
      {/* Full-screen 3D Map */}
      <MapErrorBoundary>
        <Map3D
          settings={settings}
          selectedLocation={selectedLocation}
          mapCommand={mapCommand}
          itineraryRouteData={itineraryRouteData}
        />
      </MapErrorBoundary>

      {/* Overlay UI */}
      <MapOverlayUI
        onSearch={handleSearch}
        onVoiceClick={handleVoiceClick}
        onNavClick={handleNavClick}
        onItemClick={handleItemClick}
        itineraryItems={overlayItems.length > 0 ? overlayItems : undefined}
        budget={budget}
        totalBudget={totalBudget > 0 ? totalBudget : undefined}
      />
    </div>
  );
}

export default App;
