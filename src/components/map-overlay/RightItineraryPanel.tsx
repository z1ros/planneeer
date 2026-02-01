import ItineraryTimeline from './ItineraryTimeline';
import BudgetBreakdown from './BudgetBreakdown';

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
  cost?: number;
  category?: 'food' | 'activity' | 'transit';
  coordinates?: { lat: number; lng: number };
}

export interface BudgetData {
  food: number;
  activity: number;
  transit: number;
}

export interface RouteInfo {
  totalDuration: number;
  segments: Array<{ mode: string; duration: number }>;
  walkToStation?: number;
  subwayDuration?: number;
  walkFromStation?: number;
}

interface RightItineraryPanelProps {
  items: ItineraryItem[];
  budget: BudgetData;
  totalBudget: number | null;
  onItemClick?: (item: ItineraryItem) => void;
  activePlan?: 'A' | 'B';
  onPlanChange?: (plan: 'A' | 'B') => void;
  isLoading?: boolean;
  routeInfo?: RouteInfo | null;
}

export default function RightItineraryPanel({
  items,
  budget,
  totalBudget,
  onItemClick,
  activePlan = 'A',
  onPlanChange,
  isLoading = false,
  routeInfo = null
}: RightItineraryPanelProps) {
  // Calculate spent vs remaining
  const totalSpent = budget.food + budget.activity + budget.transit;
  const remaining = totalBudget !== null ? Math.max(0, totalBudget - totalSpent) : 0;

  const handlePlanClick = (plan: 'A' | 'B') => {
    if (onPlanChange) {
      onPlanChange(plan);
    }
  };

  return (
    <div className="absolute right-4 top-4 w-[280px] max-h-[calc(100vh-170px)] overflow-hidden bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 p-4 pointer-events-auto flex flex-col shadow-[0_4px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]">
      {/* Plan Toggle */}
      <div className="flex items-center gap-2 bg-black/30 rounded-xl p-1 shrink-0">
        <button
          className={`flex-1 py-2.5 px-4 rounded-[10px] border-none text-sm font-medium cursor-pointer transition-all duration-200 ${
            activePlan === 'A'
              ? 'bg-orange-500 text-white shadow-[0_2px_8px_rgba(249,115,22,0.4)]'
              : 'bg-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => handlePlanClick('A')}
        >
          Plan A
        </button>
        <button
          className={`flex-1 py-2.5 px-4 rounded-[10px] border-none text-sm font-medium cursor-pointer transition-all duration-200 ${
            activePlan === 'B'
              ? 'bg-orange-500 text-white shadow-[0_2px_8px_rgba(249,115,22,0.4)]'
              : 'bg-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => handlePlanClick('B')}
        >
          Plan B
        </button>
        <button
          className={`w-9 h-9 rounded-[10px] border-none bg-white/5 text-white/50 text-sm cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-white/10 hover:text-white/80 ${isLoading ? 'animate-spin' : ''}`}
          title="Refresh"
        >
          <i className={`fa-solid ${isLoading ? 'fa-spinner' : 'fa-rotate-right'}`}></i>
        </button>
      </div>

      {/* Remaining Budget Display - only show if user specified a budget */}
      {totalBudget !== null && totalBudget > 0 && (
        <div className="flex justify-between items-center mt-3 px-1 text-xs">
          <span className="text-white/50">Remaining</span>
          <span className={`font-medium ${remaining > 10 ? 'text-green-400' : remaining > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
            ${remaining.toFixed(2)}
          </span>
        </div>
      )}

      {/* Timeline or Empty State */}
      {items.length > 0 ? (
        <>
          <ItineraryTimeline items={items} onItemClick={onItemClick} routeInfo={routeInfo} />
          <BudgetBreakdown budget={budget} totalBudget={totalBudget} totalSpent={totalSpent} />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <i className="fa-solid fa-route text-4xl text-white/20 mb-3"></i>
          <p className="text-white/40 text-sm mb-1">No itinerary yet</p>
          <p className="text-white/30 text-xs">Search below to build your plan</p>
        </div>
      )}
    </div>
  );
}
