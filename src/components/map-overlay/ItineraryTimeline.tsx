import { useState } from 'react';
import type { ItineraryItem, RouteInfo } from './RightItineraryPanel';

interface ItineraryTimelineProps {
  items: ItineraryItem[];
  onItemClick?: (item: ItineraryItem) => void;
  onGetDirections?: (item: ItineraryItem) => void;
  routeInfo?: RouteInfo | null;
}

export default function ItineraryTimeline({ items, onItemClick, onGetDirections, routeInfo }: ItineraryTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleItemClick = (item: ItineraryItem) => {
    setExpandedId(expandedId === item.id ? null : item.id);
    onItemClick?.(item);
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(<i key={i} className="fa-solid fa-star text-yellow-400"></i>);
    }
    if (hasHalfStar) {
      stars.push(<i key="half" className="fa-solid fa-star-half-stroke text-yellow-400"></i>);
    }
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<i key={`empty-${i}`} className="fa-regular fa-star text-white/30"></i>);
    }
    return stars;
  };

  // Get transit steps to show
  const getTransitSteps = () => {
    if (routeInfo && routeInfo.segments && routeInfo.segments.length > 0) {
      const steps = [];
      if (routeInfo.walkToStation && routeInfo.walkToStation > 0) {
        steps.push({ icon: 'fa-person-walking', text: `${routeInfo.walkToStation} min walk`, color: 'bg-emerald-500' });
      }
      if (routeInfo.subwayDuration && routeInfo.subwayDuration > 0) {
        steps.push({ icon: 'fa-train-subway', text: `${routeInfo.subwayDuration} min subway`, color: 'bg-blue-500' });
      }
      if (routeInfo.walkFromStation && routeInfo.walkFromStation > 0) {
        steps.push({ icon: 'fa-person-walking', text: `${routeInfo.walkFromStation} min walk`, color: 'bg-emerald-500' });
      }
      // If only walking (no subway), show total walk time
      if (steps.length === 0 && routeInfo.totalDuration > 0) {
        steps.push({ icon: 'fa-person-walking', text: `${routeInfo.totalDuration} min walk`, color: 'bg-emerald-500' });
      }
      return steps;
    }
    return null;
  };

  const transitSteps = getTransitSteps();

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden mt-4 min-h-0 w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="flex flex-col gap-2 relative w-full">
        
        {/* Transit Block - shows how to get there */}
        {transitSteps && transitSteps.length > 0 && (
          <div className="bg-white/5 rounded-xl border border-white/[0.08] p-3">
            <div className="flex flex-col gap-2">
              {transitSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${step.color} flex items-center justify-center`}>
                    <i className={`fa-solid ${step.icon} text-white text-sm`}></i>
                  </div>
                  <span className="text-white text-sm font-medium">{step.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Place Cards */}
        {items.map((item, index) => {
          const isExpanded = expandedId === item.id;
          
          return (
            <div key={item.id} className="flex flex-col">
              {/* Place Card */}
              <div 
                className={`flex flex-col bg-white/5 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                  isExpanded 
                    ? 'bg-white/[0.08] border-white/20' 
                    : 'border-white/[0.08] hover:bg-white/[0.08] hover:border-white/15'
                }`}
              >
                {/* Main row */}
                <div 
                  className="flex items-center gap-3 p-3"
                  onClick={() => handleItemClick(item)}
                >
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-base shrink-0"
                    style={{ backgroundColor: item.iconBg }}
                  >
                    <i className={`fa-solid ${item.icon}`}></i>
                  </div>
                  <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                    <span className="text-white text-sm font-semibold truncate">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white/50 text-xs">
                        Avg: {item.price || item.priceRange}
                      </span>
                      {item.duration && (
                        <>
                          <span className="text-white/30">•</span>
                          <span className="text-white/50 text-xs">{item.duration}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <i className={`fa-solid fa-chevron-down text-white/40 text-xs transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}></i>
                </div>

                {/* Expanded content */}
                <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="px-3 pb-3 pt-1 border-t border-white/10">
                    {item.rating && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex gap-0.5 text-[10px]">
                          {renderStars(item.rating)}
                        </div>
                        <span className="text-white/60 text-xs">{item.rating}</span>
                        {item.reviewCount && (
                          <span className="text-white/40 text-xs">({item.reviewCount})</span>
                        )}
                      </div>
                    )}

                    {item.address && (
                      <div className="flex items-start gap-2 mb-2">
                        <i className="fa-solid fa-location-dot text-white/40 text-xs mt-0.5"></i>
                        <span className="text-white/60 text-xs leading-relaxed">{item.address}</span>
                      </div>
                    )}

                    {item.description && (
                      <p className="text-white/50 text-xs leading-relaxed mb-3">
                        {item.description}
                      </p>
                    )}

                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {item.tags.map((tag, i) => (
                          <span 
                            key={i} 
                            className="px-2 py-0.5 bg-white/10 rounded-full text-white/60 text-[10px]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <button 
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGetDirections?.(item);
                      }}
                    >
                      <i className="fa-solid fa-diamond-turn-right"></i>
                      Get Directions
                    </button>
                  </div>
                </div>
              </div>

              {/* Transit between places (if more than one place) */}
              {index < items.length - 1 && (
                <div className="py-2 pl-5">
                  <div className="flex items-center gap-2 text-white/40">
                    <div className="w-px h-4 bg-white/20"></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
