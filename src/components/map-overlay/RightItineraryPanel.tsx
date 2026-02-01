import { useState } from 'react';
import ItineraryTimeline from './ItineraryTimeline';
import BudgetBreakdown from './BudgetBreakdown';
import { DetailedItinerary, DetailedStop } from '../../services/plannerApi';

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
  savedItems?: ItineraryItem[];
  onRemoveSavedItem?: (itemId: string) => void;
  onClearSavedItems?: () => void;
  onBuildItinerary?: () => void;
  detailedItinerary?: DetailedItinerary | null;
  onClearDetailedItinerary?: () => void;
}

// NYC Subway line colors - official MTA colors
const SUBWAY_COLORS: Record<string, string> = {
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

// Subway line pill component - circular badge
function SubwayPill({ line }: { line: string }) {
  const color = SUBWAY_COLORS[line] || '#666';
  const isYellow = ['N', 'Q', 'R', 'W'].includes(line);
  return (
    <span 
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shadow-sm"
      style={{ 
        backgroundColor: color,
        color: isYellow ? '#000' : '#fff'
      }}
    >
      {line}
    </span>
  );
}

// Type badge colors and icons
const TYPE_CONFIG = {
  food: { bg: 'from-pink-500 to-rose-600', icon: 'fa-utensils', label: 'Food' },
  event: { bg: 'from-violet-500 to-purple-600', icon: 'fa-calendar-star', label: 'Event' },
  landmark: { bg: 'from-amber-500 to-orange-600', icon: 'fa-landmark', label: 'Landmark' },
  activity: { bg: 'from-blue-500 to-cyan-600', icon: 'fa-person-running', label: 'Activity' }
};

// Detailed stop card component - redesigned
function DetailedStopCard({ stop, stopNumber, isLast, isExpanded }: { 
  stop: DetailedStop; 
  stopNumber: number;
  isLast: boolean; 
  isExpanded: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const config = TYPE_CONFIG[stop.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.activity;
  
  return (
    <div className="relative">
      {/* Connection line to previous stop */}
      {stopNumber > 1 && (
        <div className="absolute -top-2 left-[18px] w-0.5 h-2 bg-gradient-to-b from-white/20 to-white/5"></div>
      )}
      
      {/* Stop Card */}
      <div 
        className={`relative bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.08] overflow-hidden hover:border-white/20 hover:bg-white/[0.05] transition-all duration-300 ${showDetails ? 'ring-1 ring-white/20' : ''}`}
        onClick={() => setShowDetails(!showDetails)}
      >
        {/* Gradient accent line */}
        <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${config.bg} opacity-60`}></div>
        
        {/* Main content */}
        <div className="p-3">
          {/* Header row */}
          <div className="flex items-start gap-3">
            {/* Stop number badge */}
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${config.bg} flex items-center justify-center shrink-0 shadow-lg`}>
              <span className="text-white font-bold text-sm">{stopNumber}</span>
            </div>
            
            {/* Name and time */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">{stop.arrivalTime}</span>
                <span className="text-white/20">→</span>
                <span className="text-[10px] font-medium text-white/30">{stop.departureTime}</span>
              </div>
              <h4 className={`text-white font-semibold ${isExpanded ? 'text-sm' : 'text-[13px]'} leading-tight line-clamp-2`}>
                {stop.name}
              </h4>
            </div>
            
            {/* Cost and duration */}
            <div className="text-right shrink-0">
              <div className="text-emerald-400 font-bold text-sm">{stop.cost || 'Free'}</div>
              <div className="text-white/30 text-[10px]">{stop.duration}</div>
            </div>
          </div>
          
          {/* Why Visit - always visible */}
          {stop.whyVisit && (
            <p className={`mt-2 text-white/50 ${isExpanded ? 'text-xs' : 'text-[11px]'} leading-relaxed line-clamp-2`}>
              {stop.whyVisit}
            </p>
          )}
          
          {/* Expandable details */}
          {showDetails && (
            <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* What To Do */}
              {stop.whatToDo && (
                <div className="flex gap-2">
                  <div className="w-5 h-5 rounded-md bg-blue-500/20 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-list-check text-blue-400 text-[10px]"></i>
                  </div>
                  <p className="text-white/60 text-[11px] leading-relaxed">{stop.whatToDo}</p>
                </div>
              )}
              
              {/* Pro Tip */}
              {stop.proTip && (
                <div className="flex gap-2 bg-amber-500/10 rounded-lg p-2 -mx-1">
                  <div className="w-5 h-5 rounded-md bg-amber-500/20 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-lightbulb text-amber-400 text-[10px]"></i>
                  </div>
                  <p className="text-amber-200/80 text-[11px] leading-relaxed italic">{stop.proTip}</p>
                </div>
              )}
            </div>
          )}
          
          {/* Click hint */}
          <div className="mt-2 flex items-center justify-center">
            <span className="text-[9px] text-white/20">
              {showDetails ? 'Click to collapse' : 'Click for details'}
            </span>
          </div>
        </div>
        
        {/* Nearest Station - compact footer */}
        {stop.nearestStation && (
          <div className="px-3 py-2 bg-black/20 border-t border-white/[0.05] flex items-center gap-2">
            <i className="fa-solid fa-train-subway text-blue-400/70 text-[10px]"></i>
            <span className="text-white/50 text-[10px] flex-1 truncate">{stop.nearestStation.name}</span>
            <div className="flex gap-0.5">
              {stop.nearestStation.lines.slice(0, 5).map((line, i) => (
                <SubwayPill key={i} line={line} />
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Transit to Next - redesigned */}
      {!isLast && stop.transitToNext && (
        <div className="relative my-1.5 ml-[18px]">
          {/* Vertical line */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500/40 via-blue-500/20 to-blue-500/40"></div>
          
          {/* Transit card */}
          <div className="ml-4 bg-blue-500/[0.08] rounded-lg p-2.5 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-md bg-blue-500/30 flex items-center justify-center">
                <i className={`fa-solid ${stop.transitToNext.method === 'subway' ? 'fa-train-subway' : stop.transitToNext.method === 'walk' ? 'fa-person-walking' : 'fa-bus'} text-blue-300 text-[10px]`}></i>
              </div>
              <span className="text-blue-200/90 text-xs font-semibold">{stop.transitToNext.duration}</span>
              {stop.transitToNext.subwayLines && stop.transitToNext.subwayLines.length > 0 && (
                <div className="flex gap-0.5 ml-auto">
                  {stop.transitToNext.subwayLines.slice(0, 4).map((line, i) => (
                    <SubwayPill key={i} line={line} />
                  ))}
                </div>
              )}
            </div>
            <p className="text-blue-100/50 text-[10px] leading-relaxed">{stop.transitToNext.instructions}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RightItineraryPanel({
  items,
  budget,
  totalBudget,
  onItemClick,
  activePlan = 'A',
  onPlanChange,
  isLoading = false,
  routeInfo = null,
  savedItems = [],
  onRemoveSavedItem,
  onClearSavedItems,
  onBuildItinerary,
  detailedItinerary,
  onClearDetailedItinerary
}: RightItineraryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const totalSpent = budget.food + budget.activity + budget.transit;
  const remaining = totalBudget !== null ? Math.max(0, totalBudget - totalSpent) : 0;

  const handlePlanClick = (plan: 'A' | 'B') => {
    if (onPlanChange) {
      onPlanChange(plan);
    }
  };

  // Detailed Itinerary View - Premium Design
  if (detailedItinerary) {
    return (
      <div 
        className={`absolute right-4 top-4 ${isExpanded ? 'w-[520px]' : 'w-[340px]'} max-h-[calc(100vh-100px)] overflow-hidden rounded-2xl pointer-events-auto flex flex-col transition-all duration-300 ease-out`}
        style={{
          background: 'linear-gradient(165deg, rgba(15,23,42,0.97) 0%, rgba(10,15,30,0.98) 100%)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)'
        }}
      >
        {/* Header */}
        <div className="p-4 shrink-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)' }}>
          {/* Top controls */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                <i className="fa-solid fa-route text-white text-sm"></i>
              </div>
              <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Your Itinerary</span>
            </div>
            <div className="flex gap-1">
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-all"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                <i className={`fa-solid ${isExpanded ? 'fa-compress-wide' : 'fa-expand-wide'} text-xs`}></i>
              </button>
              {onClearDetailedItinerary && (
                <button 
                  onClick={onClearDetailedItinerary}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 flex items-center justify-center transition-all"
                  title="Clear itinerary"
                >
                  <i className="fa-solid fa-times text-xs"></i>
                </button>
              )}
            </div>
          </div>
          
          {/* Title */}
          <h2 className={`text-white font-bold ${isExpanded ? 'text-xl' : 'text-lg'} leading-tight mb-1`}>
            {detailedItinerary.title}
          </h2>
          <p className="text-white/40 text-xs leading-relaxed line-clamp-2">{detailedItinerary.overview}</p>
          
          {/* Stats row */}
          <div className="flex gap-2 mt-3">
            <div className="flex-1 bg-white/[0.03] rounded-xl p-2.5 border border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <i className="fa-solid fa-clock text-orange-400/80 text-[10px]"></i>
                <span className="text-white/80 text-xs font-semibold">{detailedItinerary.totalDuration}</span>
              </div>
              <span className="text-white/30 text-[9px]">Duration</span>
            </div>
            <div className="flex-1 bg-white/[0.03] rounded-xl p-2.5 border border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <i className="fa-solid fa-dollar-sign text-emerald-400/80 text-[10px]"></i>
                <span className="text-white/80 text-xs font-semibold">{detailedItinerary.totalCost}</span>
              </div>
              <span className="text-white/30 text-[9px]">Est. Cost</span>
            </div>
            <div className="flex-1 bg-white/[0.03] rounded-xl p-2.5 border border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <i className="fa-solid fa-map-pin text-blue-400/80 text-[10px]"></i>
                <span className="text-white/80 text-xs font-semibold">{detailedItinerary.stops.length}</span>
              </div>
              <span className="text-white/30 text-[9px]">Stops</span>
            </div>
          </div>
        </div>
        
        {/* Stops List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5 custom-scrollbar">
          {detailedItinerary.stops.map((stop, index) => (
            <DetailedStopCard 
              key={stop.id || index} 
              stop={stop} 
              stopNumber={index + 1}
              isLast={index === detailedItinerary.stops.length - 1}
              isExpanded={isExpanded}
            />
          ))}
        </div>
        
        {/* Pro Tips */}
        {detailedItinerary.tips && detailedItinerary.tips.length > 0 && (
          <div className="px-3 py-2.5 border-t border-white/[0.06] shrink-0" style={{ background: 'linear-gradient(180deg, rgba(168,85,247,0.05) 0%, transparent 100%)' }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <i className="fa-solid fa-wand-magic-sparkles text-purple-400/80 text-[10px]"></i>
              <span className="text-white/50 text-[10px] font-semibold uppercase tracking-wider">Pro Tips</span>
            </div>
            <div className="space-y-1">
              {detailedItinerary.tips.slice(0, 3).map((tip, i) => (
                <p key={i} className="text-white/40 text-[10px] flex items-start gap-1.5">
                  <span className="text-purple-400/60">•</span>
                  <span className="leading-relaxed">{tip}</span>
                </p>
              ))}
            </div>
          </div>
        )}
        
        {/* Budget Footer */}
        <div className="px-3 py-3 border-t border-white/[0.06] shrink-0 bg-black/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 text-center">
              <div className="text-pink-400 font-bold text-base">${Math.round(budget.food)}</div>
              <div className="text-white/30 text-[9px] uppercase tracking-wider">Food</div>
            </div>
            <div className="w-px h-8 bg-white/10"></div>
            <div className="flex-1 text-center">
              <div className="text-purple-400 font-bold text-base">${Math.round(budget.activity)}</div>
              <div className="text-white/30 text-[9px] uppercase tracking-wider">Activities</div>
            </div>
            <div className="w-px h-8 bg-white/10"></div>
            <div className="flex-1 text-center">
              <div className="text-blue-400 font-bold text-base">${Math.round(budget.transit)}</div>
              <div className="text-white/30 text-[9px] uppercase tracking-wider">Transit</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default Panel (Saved Items / Empty State)
  return (
    <div 
      className="absolute right-4 top-4 w-[300px] max-h-[calc(100vh-170px)] overflow-hidden rounded-2xl pointer-events-auto flex flex-col"
      style={{
        background: 'linear-gradient(165deg, rgba(15,23,42,0.95) 0%, rgba(10,15,30,0.97) 100%)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)'
      }}
    >
      {/* Plan Toggle */}
      <div className="p-3 shrink-0">
        <div className="flex items-center gap-1.5 bg-black/30 rounded-xl p-1">
          <button
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activePlan === 'A'
                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/20'
                : 'text-white/50 hover:text-white/80'
            }`}
            onClick={() => handlePlanClick('A')}
          >
            Plan A
          </button>
          <button
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activePlan === 'B'
                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/20'
                : 'text-white/50 hover:text-white/80'
            }`}
            onClick={() => handlePlanClick('B')}
          >
            Plan B
          </button>
          <button
            className={`w-8 h-8 rounded-lg bg-white/5 text-white/40 text-xs flex items-center justify-center hover:bg-white/10 hover:text-white transition-all ${isLoading ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <i className={`fa-solid ${isLoading ? 'fa-spinner' : 'fa-rotate-right'}`}></i>
          </button>
        </div>
      </div>

      {/* Budget Display */}
      {totalBudget !== null && totalBudget > 0 && (
        <div className="flex justify-between items-center px-4 pb-2 text-xs">
          <span className="text-white/40">Remaining</span>
          <span className={`font-semibold ${remaining > 10 ? 'text-emerald-400' : remaining > 0 ? 'text-amber-400' : 'text-red-400'}`}>
            ${remaining.toFixed(2)}
          </span>
        </div>
      )}

      {/* Content */}
      {items.length > 0 ? (
        <>
          <ItineraryTimeline items={items} onItemClick={onItemClick} routeInfo={routeInfo} />
          <BudgetBreakdown budget={budget} totalBudget={totalBudget} totalSpent={totalSpent} />
        </>
      ) : savedItems.length > 0 ? (
        <div className="flex-1 flex flex-col px-3 pb-3 overflow-hidden">
          {/* Saved Items Header */}
          <div className="flex justify-between items-center mb-2 px-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <i className="fa-solid fa-bookmark text-orange-400 text-[10px]"></i>
              </div>
              <span className="text-white/60 text-xs font-medium">Your selections ({savedItems.length})</span>
            </div>
            {onClearSavedItems && (
              <button 
                onClick={onClearSavedItems}
                className="text-white/30 text-[10px] hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          
          {/* Saved Items List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {savedItems.map((item, index) => (
              <div 
                key={item.id}
                className="bg-white/[0.03] rounded-xl p-2.5 border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.05] transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500/80 to-red-500/80 flex items-center justify-center shrink-0 text-white text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white text-xs font-medium truncate">{item.name}</h4>
                    {item.address && (
                      <p className="text-white/30 text-[10px] truncate">{item.address}</p>
                    )}
                  </div>
                  {onRemoveSavedItem && (
                    <button 
                      onClick={() => onRemoveSavedItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all p-1"
                    >
                      <i className="fa-solid fa-times text-[10px]"></i>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Build Itinerary Button */}
          {onBuildItinerary && (
            <button
              onClick={onBuildItinerary}
              disabled={isLoading || savedItems.length < 2}
              className={`mt-3 w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                isLoading 
                  ? 'bg-orange-500/30 text-white/50 cursor-wait'
                  : savedItems.length < 2
                    ? 'bg-white/5 text-white/30 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-lg hover:shadow-orange-500/30 hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              {isLoading ? (
                <>
                  <i className="fa-solid fa-spinner animate-spin"></i>
                  <span>Building with AI...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  <span>{savedItems.length < 2 ? 'Add 2+ spots' : 'Build Smart Itinerary'}</span>
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center mb-4">
            <i className="fa-solid fa-route text-3xl text-orange-400/50"></i>
          </div>
          <p className="text-white/50 text-sm font-medium mb-1">No itinerary yet</p>
          <p className="text-white/30 text-xs">Click on places on the map to add them to your trip</p>
        </div>
      )}
    </div>
  );
}
