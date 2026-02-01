import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Map3D from './components/Map3D';
import MapErrorBoundary from './components/MapErrorBoundary';
import { LeftSidebar, RightItineraryPanel, BottomSearchBar, ItineraryItem, BudgetData } from './components/map-overlay';
import WelcomeScreen from './components/WelcomeScreen';
import { ItineraryEvent } from './types';
import { getSmartPlan, SmartPlanResponse, PlanData } from './services/plannerApi';
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

  // Smart planner state
  const [isSearching, setIsSearching] = useState(false);
  const [plans, setPlans] = useState<{ A: PlanData; B: PlanData } | null>(null);
  const [activePlan, setActivePlan] = useState<'A' | 'B'>('A');
  const [totalBudgetAmount, setTotalBudgetAmount] = useState<number | null>(null); // No default - only set when user specifies
  const [budget, setBudget] = useState<BudgetData>(defaultBudget);

  const [mapCommand, setMapCommand] = useState<{
    action: 'zoom_in' | 'zoom_out' | 'fly_to';
    location?: string;
    timestamp: number;
  } | null>(null);

  const [itineraryRouteData, setItineraryRouteData] = useState<any>(null);

  // User location - default to 200 W 26th St, NYC (Flatiron District)
  const [userLocation] = useState<{ lat: number; lng: number; address: string }>({
    lat: 40.7448,
    lng: -73.9932,
    address: '200 W 26th St, New York, NY 10001'
  });

  const handleDisplayStart = useCallback((mode: 'voice' | 'chat') => {
    setShowWelcome(false);
    if (mode === 'voice') {
      setVoiceOnboardingActive(true);
    }
  }, []);

  // Smart search handler - calls the vector search + AI planner API
  const handleSearch = useCallback(async (query: string) => {
    console.log('[App] Search query:', query);
    setIsSearching(true);

    try {
      const response = await getSmartPlan({ 
        query,
        userLocation: { lat: userLocation.lat, lng: userLocation.lng }
      });
      console.log('[App] Smart plan response:', response);

      // Store both plans
      setPlans(response.plans);

      // Set the parsed budget if available
      if (response.parsedBudget) {
        setTotalBudgetAmount(response.parsedBudget);
      }

      // Update budget from active plan
      const currentPlan = response.plans[activePlan];
      setBudget(currentPlan.budget);

      // Build route data for map - collect all coordinates from itinerary items
      const routePoints: Array<{ lat: number; lng: number; name: string; type: string }> = [];
      
      // Start with user location
      routePoints.push({
        lat: userLocation.lat,
        lng: userLocation.lng,
        name: 'Your Location',
        type: 'start'
      });

      // Add each itinerary item that has coordinates
      for (const item of currentPlan.items) {
        if (item.coordinates && item.coordinates.lat && item.coordinates.lng) {
          routePoints.push({
            lat: item.coordinates.lat,
            lng: item.coordinates.lng,
            name: item.name,
            type: item.type
          });
        }
      }

      console.log('[App] Route points:', routePoints);
      
      // Set route data for map
      if (routePoints.length > 1) {
        setItineraryRouteData({
          points: routePoints,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      console.error('[App] Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [activePlan, userLocation]);

  // Handle plan switching
  const handlePlanChange = useCallback((plan: 'A' | 'B') => {
    setActivePlan(plan);
    if (plans) {
      setBudget(plans[plan].budget);
      
      // Update route for new plan
      const routePoints: Array<{ lat: number; lng: number; name: string; type: string }> = [];
      routePoints.push({
        lat: userLocation.lat,
        lng: userLocation.lng,
        name: 'Your Location',
        type: 'start'
      });

      for (const item of plans[plan].items) {
        if (item.coordinates && item.coordinates.lat && item.coordinates.lng) {
          routePoints.push({
            lat: item.coordinates.lat,
            lng: item.coordinates.lng,
            name: item.name,
            type: item.type
          });
        }
      }

      if (routePoints.length > 1) {
        setItineraryRouteData({
          points: routePoints,
          timestamp: Date.now()
        });
      }
    }
  }, [plans, userLocation]);

  const handleVoiceClick = useCallback(() => {
    console.log('[App] Voice button clicked');
    setVoiceOnboardingActive(true);
  }, []);

  const handleItemClick = useCallback((item: ItineraryItem) => {
    console.log('[App] Item clicked:', item);
  }, []);

  // State for real route duration and segments
  const [routeInfo, setRouteInfo] = useState<{ 
    totalDuration: number; 
    segments: Array<{ mode: string; duration: number }>;
    walkToStation?: number;
    subwayDuration?: number;
    walkFromStation?: number;
  } | null>(null);

  // Callback when route is calculated
  const handleRouteCalculated = useCallback((info: { totalDuration: number; segments: Array<{ mode: string; duration: number }> }) => {
    console.log('[App] Route calculated - received:', info);
    
    // Parse segments to get walking and transit times
    let walkToStation = 0;
    let subwayDuration = 0;
    let walkFromStation = 0;
    
    info.segments.forEach((seg, idx) => {
      console.log(`[App] Segment ${idx}: mode=${seg.mode}, duration=${seg.duration} min`);
      if (seg.mode === 'walking') {
        if (idx === 0) {
          walkToStation = seg.duration;
        } else {
          walkFromStation = seg.duration;
        }
      } else if (seg.mode === 'transit') {
        subwayDuration = seg.duration;
      }
    });
    
    const routeData = {
      ...info,
      walkToStation,
      subwayDuration,
      walkFromStation
    };
    
    console.log('[App] Setting routeInfo:', routeData);
    setRouteInfo(routeData);
  }, []);

  // Get items from active plan
  const overlayItems: ItineraryItem[] = plans ? plans[activePlan].items : [];

  const totalSpent = budget.food + budget.activity + budget.transit;

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
          onRouteCalculated={handleRouteCalculated}
        />
      </MapErrorBoundary>

      {/* Right Panel & Bottom Search - Map specific UI */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <RightItineraryPanel
          items={overlayItems}
          budget={budget}
          totalBudget={totalBudgetAmount}
          onItemClick={handleItemClick}
          activePlan={activePlan}
          onPlanChange={handlePlanChange}
          isLoading={isSearching}
          routeInfo={routeInfo}
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
