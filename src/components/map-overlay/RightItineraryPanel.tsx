import { useState } from 'react';
import type { ItineraryItem, BudgetData } from './index';

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
  const [activeTab, setActiveTab] = useState<'A' | 'B'>('A');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const handleItemClick = (item: ItineraryItem) => {
    setExpandedItem(expandedItem === item.id ? null : item.id);
    onItemClick?.(item);
  };

  return (
    <div className="absolute right-4 top-4 bottom-24 w-72 pointer-events-auto z-50 flex flex-col">
      {/* Panel Container */}
      <div className="bg-[#1a1a2e]/90 backdrop-blur-xl rounded-2xl border border-white/10 flex flex-col h-full overflow-hidden">
        
        {/* Header with Tabs */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('A')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'A'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Plan A
            </button>
            <button
              onClick={() => setActiveTab('B')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'B'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Plan B
            </button>
            <div className="flex-1"></div>
            <button className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <i className="fa-solid fa-rotate text-gray-400 text-sm"></i>
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.id}>
                {/* Time indicator */}
                {index === 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fa-regular fa-clock text-gray-500 text-xs"></i>
                    <span className="text-gray-500 text-xs">5 minutes</span>
                  </div>
                )}
                
                {/* Item card */}
                <div 
                  onClick={() => handleItemClick(item)}
                  className={`
                    bg-white/5 hover:bg-white/10 rounded-xl p-3 cursor-pointer transition-all duration-200 border border-white/5
                    ${expandedItem === item.id ? 'bg-white/10 border-white/10' : ''}
                  `}
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: item.iconBg }}
                    >
                      <i className={`fa-solid ${item.icon} text-white text-sm`}></i>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white text-sm">{item.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {item.price && <span>Price: {item.price}</span>}
                        {item.priceRange && <span>{item.priceRange}</span>}
                        {item.duration && <span>{item.duration}</span>}
                      </div>
                    </div>

                    {/* Expand icon */}
                    <i className={`fa-solid fa-chevron-down text-gray-500 text-xs transition-transform ${expandedItem === item.id ? 'rotate-180' : ''}`}></i>
                  </div>

                  {/* Expanded content */}
                  {expandedItem === item.id && item.description && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-xs text-gray-400 leading-relaxed">{item.description}</p>
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.tags.map((tag, i) => (
                            <span 
                              key={i}
                              className="px-2 py-0.5 bg-white/10 text-gray-300 rounded-full text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Time between items */}
                {index < items.length - 1 && (
                  <div className="flex items-center gap-2 my-2 ml-5">
                    <div className="w-0.5 h-4 bg-white/20"></div>
                    <span className="text-gray-500 text-xs">10 minutes</span>
                  </div>
                )}
              </div>
            ))}

            {items.length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i className="fa-solid fa-route text-gray-500 text-2xl"></i>
                </div>
                <p className="text-gray-400 text-sm">No items yet</p>
                <p className="text-gray-500 text-xs mt-1">Search to add places</p>
              </div>
            )}
          </div>
        </div>

        {/* Budget Breakdown */}
        <div className="p-4 border-t border-white/10 bg-[#12121f]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm font-medium">Budget Breakdown</span>
            <span className="text-white font-bold">{totalBudget.toFixed(2)}$</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Food</span>
              <span className="text-gray-300">{budget.food.toFixed(2)}$</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Activity</span>
              <span className="text-gray-300">{budget.activity.toFixed(2)}$</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Transit</span>
              <span className="text-gray-300">{budget.transit.toFixed(2)}$</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
