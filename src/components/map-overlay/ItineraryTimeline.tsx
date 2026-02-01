import { useState } from 'react';
import type { ItineraryItem } from './RightItineraryPanel';

interface ItineraryTimelineProps {
  items: ItineraryItem[];
  onItemClick?: (item: ItineraryItem) => void;
  onGetDirections?: (item: ItineraryItem) => void;
}

export default function ItineraryTimeline({ items, onItemClick, onGetDirections }: ItineraryTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getWaitTime = (index: number) => {
    if (index === 0) return '5 minutes';
    if (index === 1) return '10 minutes';
    return null;
  };

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

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden mt-4 min-h-0 w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <div className="flex flex-col gap-2 relative w-full before:content-[''] before:absolute before:left-[6px] before:top-[30px] before:bottom-5 before:w-0.5 before:bg-white/15 before:rounded-sm">
        {items.map((item, index) => {
          const isExpanded = expandedId === item.id;
          
          return (
            <div key={item.id} className="flex flex-col gap-1">
              {/* Wait time indicator */}
              {getWaitTime(index) && (
                <div className="flex items-center gap-2 py-2 pl-6 text-white/50 text-xs">
                  <i className="fa-solid fa-person-walking text-[10px]"></i>
                  <span>{getWaitTime(index)}</span>
                </div>
              )}
              
              {/* Timeline item */}
              <div className="flex items-start gap-3 relative w-full min-w-0">
                <div className="w-3.5 h-3.5 rounded-full bg-white/20 border-2 border-white/30 shrink-0 mt-4 z-[1]" />
                <div 
                  className={`flex-1 flex flex-col bg-white/5 rounded-xl border transition-all duration-300 cursor-pointer min-w-0 overflow-hidden ${
                    isExpanded 
                      ? 'bg-white/[0.08] border-white/20' 
                      : 'border-white/[0.08] hover:bg-white/[0.08] hover:border-white/15'
                  }`}
                >
                  {/* Main row - always visible */}
                  <div 
                    className="flex items-center gap-2 p-3 min-w-0 w-full"
                    onClick={() => handleItemClick(item)}
                  >
                    <div 
                      className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white text-sm shrink-0"
                      style={{ backgroundColor: item.iconBg }}
                    >
                      <i className={`fa-solid ${item.icon}`}></i>
                    </div>
                    <div className="flex-1 flex flex-col gap-0.5 min-w-0 overflow-hidden">
                      <span className="text-white text-sm font-medium truncate">{item.name}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-white/50 text-xs truncate">
                          {item.priceRange || `Price: ${item.price}`}
                        </span>
                        {item.duration && (
                          <span className="text-white/40 text-xs whitespace-nowrap shrink-0">{item.duration}</span>
                        )}
                      </div>
                    </div>
                    <i className={`fa-solid fa-chevron-down text-white/40 text-xs transition-transform duration-300 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}></i>
                  </div>

                  {/* Expanded content */}
                  <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="px-3 pb-3 pt-1 border-t border-white/10">
                      {/* Rating */}
                      {item.rating && (
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex gap-0.5 text-[10px]">
                            {renderStars(item.rating)}
                          </div>
                          <span className="text-white/60 text-xs">{item.rating}</span>
                          {item.reviewCount && (
                            <span className="text-white/40 text-xs">({item.reviewCount} reviews)</span>
                          )}
                        </div>
                      )}

                      {/* Address */}
                      {item.address && (
                        <div className="flex items-start gap-2 mb-2">
                          <i className="fa-solid fa-location-dot text-white/40 text-xs mt-0.5"></i>
                          <span className="text-white/60 text-xs leading-relaxed">{item.address}</span>
                        </div>
                      )}

                      {/* Description */}
                      {item.description && (
                        <p className="text-white/50 text-xs leading-relaxed mb-3">
                          {item.description}
                        </p>
                      )}

                      {/* Tags */}
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

                      {/* Action button */}
                      <div className="flex">
                        <button 
                          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
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
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
