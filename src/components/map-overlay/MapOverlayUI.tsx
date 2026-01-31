import { useState } from 'react';
import { 
  LeftSidebar, 
  RightItineraryPanel, 
  BottomSearchBar,
  type ItineraryItem,
  type BudgetData
} from './index';

interface MapOverlayUIProps {
  onSearch?: (query: string) => void;
  onVoiceClick?: () => void;
  onNavClick?: (nav: 'places' | 'landmarks' | 'settings') => void;
  onItemClick?: (item: ItineraryItem) => void;
  itineraryItems?: ItineraryItem[];
  budget?: BudgetData;
  totalBudget?: number;
}

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
    description: 'Take the downtown A/C/E train towards World Trade Center. Fast and reliable during this time.',
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
    description: 'Legendary NYC pizza spot since 1975. Famous for their classic New York-style slices with crispy thin crust.',
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
    description: 'UberX available nearby. Estimated arrival in 3 minutes. Surge pricing not currently active.',
    tags: ['UberX', 'No Surge']
  },
];

const defaultBudget: BudgetData = {
  food: 7.50,
  activity: 24.50,
  transit: 24,
};

export default function MapOverlayUI({
  onSearch,
  onVoiceClick,
  onNavClick,
  onItemClick,
  itineraryItems = defaultItems,
  budget = defaultBudget,
  totalBudget = 42.75,
}: MapOverlayUIProps) {
  const [activeNav, setActiveNav] = useState<'places' | 'landmarks' | 'settings'>('places');

  const handleNavClick = (nav: 'places' | 'landmarks' | 'settings') => {
    setActiveNav(nav);
    onNavClick?.(nav);
  };

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }}>
      {/* Left Sidebar */}
      <LeftSidebar 
        activeNav={activeNav} 
        onNavClick={handleNavClick} 
      />

      {/* Right Itinerary Panel */}
      <RightItineraryPanel 
        items={itineraryItems}
        budget={budget}
        totalBudget={totalBudget}
        onItemClick={onItemClick}
      />

      {/* Bottom Search Bar */}
      <BottomSearchBar 
        onSearch={onSearch}
        onVoiceClick={onVoiceClick}
      />
    </div>
  );
}
