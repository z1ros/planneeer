import { useState } from 'react';
import ItineraryTimeline from './ItineraryTimeline';
import BudgetBreakdown from './BudgetBreakdown';

export interface ItineraryItem {
  id: string;
  type: 'transit' | 'food' | 'rideshare' | 'attraction';
  name: string;
  duration?: string;
  price?: string;
  priceRange?: string;
  icon: string;
  iconBg: string;
  // Extended info for expanded view
  address?: string;
  rating?: number;
  reviewCount?: number;
  description?: string;
  tags?: string[];
}

export interface BudgetData {
  food: number;
  activity: number;
  transit: number;
}

interface RightItineraryPanelProps {
  items: ItineraryItem[];
  budget: BudgetData;
  totalBudget: number;
  onItemClick?: (item: ItineraryItem) => void;
}

export default function RightItineraryPanel({ 
  items, 
  budget, 
  totalBudget,
  onItemClick 
}: RightItineraryPanelProps) {
  const [activePlan, setActivePlan] = useState<'A' | 'B'>('A');

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
          onClick={() => setActivePlan('A')}
        >
          Plan A
        </button>
        <button 
          className={`flex-1 py-2.5 px-4 rounded-[10px] border-none text-sm font-medium cursor-pointer transition-all duration-200 ${
            activePlan === 'B' 
              ? 'bg-orange-500 text-white shadow-[0_2px_8px_rgba(249,115,22,0.4)]' 
              : 'bg-transparent text-white/60 hover:text-white/90'
          }`}
          onClick={() => setActivePlan('B')}
        >
          Plan B
        </button>
        <button 
          className="w-9 h-9 rounded-[10px] border-none bg-white/5 text-white/50 text-sm cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-white/10 hover:text-white/80"
          title="Refresh"
        >
          <i className="fa-solid fa-rotate-right"></i>
        </button>
      </div>

      {/* Timeline */}
      <ItineraryTimeline items={items} onItemClick={onItemClick} />

      {/* Budget Breakdown */}
      <BudgetBreakdown budget={budget} totalBudget={totalBudget} />
    </div>
  );
}
