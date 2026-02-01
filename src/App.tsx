import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Map3D from './components/Map3D';
import MapErrorBoundary from './components/MapErrorBoundary';
import { LeftSidebar, RightItineraryPanel, BottomSearchBar, ItineraryItem, BudgetData } from './components/map-overlay';
import WelcomeScreen from './components/WelcomeScreen';
import { ItineraryEvent } from './types';
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

// Main Layout - LeftSidebar is always present
function MainLayout() {
  return (
    <div className="app-fullscreen relative">
      {/* Main Content Area - Changes based on route */}
      <Outlet />
      
      {/* Left Sidebar - Always visible, on top with z-index */}
      <div className="absolute inset-0 pointer-events-none z-50">
        <LeftSidebar />
      </div>
    </div>
  );
}

// Placeholder pages for routes
function JourneyPage() {
  return (
    <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
      <div className="text-center text-white">
        <i className="fa-solid fa-route text-6xl text-orange-500 mb-4"></i>
        <h1 className="text-3xl font-bold mb-2">Journey Planner</h1>
        <p className="text-white/60">Plan your perfect trip itinerary</p>
      </div>
    </div>
  );
}

function NetworkPage() {
  return (
    <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
      <div className="text-center text-white">
        <i className="fa-solid fa-users text-6xl text-orange-500 mb-4"></i>
        <h1 className="text-3xl font-bold mb-2">Social Network</h1>
        <p className="text-white/60">Connect with fellow travelers</p>
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
      <div className="text-center text-white">
        <i className="fa-solid fa-gear text-6xl text-orange-500 mb-4"></i>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-white/60">Customize your experience</p>
      </div>
    </div>
  );
}

// Default itinerary items
const defaultItems: ItineraryItem[] = [
  { 
    id: '1', 
    type: 'transit', 
    name: 'Subway', 
    duration: '30 min', 
    price: '2.25$', 
    icon: 'fa-train-subway', 
    iconBg: '#3b82f6',
    address: '34th St - Penn Station, New York, NY',
    description: 'Take the downtown A/C/E train towards World Trade Center.',
    tags: ['Express', 'A/C/E Lines']
  },
  { 
    id: '2', 
    type: 'food', 
    name: 'Jose Pizza', 
    priceRange: 'Avg prices: 7-12$', 
    icon: 'fa-pizza-slice', 
    iconBg: '#ec4899',
    address: '7 Carmine St, New York, NY 10014',
    rating: 4.5,
    reviewCount: 2847,
    description: 'Legendary NYC pizza spot since 1975.',
    tags: ['Cash Only', 'Quick Bite', 'Local Favorite']
  },
  { 
    id: '3', 
    type: 'rideshare', 
    name: 'Uber', 
    duration: '10 min', 
    price: '12$', 
    icon: 'fa-car', 
    iconBg: '#f97316',
    description: 'UberX available nearby. Estimated arrival in 3 minutes.',
    tags: ['UberX', 'No Surge']
  },
];

const defaultBudget: BudgetData = {
  food: 0,
  activity: 0,
  transit: 0,
};

function MapPage() {
  const [showWelcome, setShowWelcome] = useState(false);
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

  const [itineraryEvents, setItineraryEvents] = useState<ItineraryEvent[]>([]);
  
  const [budget] = useState<BudgetData>(defaultBudget);

  const [mapCommand, setMapCommand] = useState<{
    action: 'zoom_in' | 'zoom_out' | 'fly_to';
    location?: string;
    timestamp: number;
  } | null>(null);

  const [itineraryRouteData, setItineraryRouteData] = useState<any>(null);

  const handleDisplayStart = useCallback((mode: 'voice' | 'chat') => {
    setShowWelcome(false);
    if (mode === 'voice') {
      setVoiceOnboardingActive(true);
    }
  }, []);

  const handleSearch = useCallback((query: string) => {
    console.log('[App] Search query:', query);
  }, []);

  const handleVoiceClick = useCallback(() => {
    console.log('[App] Voice button clicked');
    setVoiceOnboardingActive(true);
  }, []);

  const handleItemClick = useCallback((item: ItineraryItem) => {
    console.log('[App] Item clicked:', item);
  }, []);

  const overlayItems: ItineraryItem[] = itineraryEvents.length > 0 
    ? itineraryEvents.map(eventToOverlayItem) 
    : defaultItems;
  const totalBudget = budget.food + budget.activity + budget.transit;

  if (showWelcome) {
    return <WelcomeScreen onStart={handleDisplayStart} />;
  }

  return (
    <>
      {/* Map Background */}
      <MapErrorBoundary>
        <Map3D
          settings={settings}
          selectedLocation={selectedLocation}
          mapCommand={mapCommand}
          itineraryRouteData={itineraryRouteData}
        />
      </MapErrorBoundary>

      {/* Right Panel & Bottom Search - Map specific UI */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <RightItineraryPanel 
          items={overlayItems}
          budget={budget}
          totalBudget={totalBudget > 0 ? totalBudget : 42.75}
          onItemClick={handleItemClick}
        />
        <BottomSearchBar 
          onSearch={handleSearch}
          onVoiceClick={handleVoiceClick}
        />
      </div>
    </>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/map" replace />} />
      <Route element={<MainLayout />}>
        <Route path="/map" element={<MapPage />} />
        <Route path="/journey" element={<JourneyPage />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
