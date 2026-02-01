import { useState } from 'react';

type LayerType = 'transit' | 'restaurants' | 'events' | 'landmarks' | null;

interface BottomSearchBarProps {
  onSearch?: (query: string) => void;
  onVoiceClick?: () => void;
  placeholder?: string;
  activeLayer?: LayerType;
}

// Dynamic placeholder based on active layer
function getPlaceholder(layer: LayerType): string {
  switch (layer) {
    case 'restaurants':
      return 'Search restaurants... (e.g., "indian", "italian", "cheap eats")';
    case 'events':
      return 'Search events... (e.g., "music", "comedy", "art")';
    case 'landmarks':
      return 'Search landmarks... (e.g., "historic", "museum", "park")';
    default:
      return "What's possible with $45 today?";
  }
}

export default function BottomSearchBar({
  onSearch,
  onVoiceClick,
  placeholder,
  activeLayer
}: BottomSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Use dynamic placeholder based on active layer, or custom placeholder if provided
  const displayPlaceholder = placeholder || getPlaceholder(activeLayer || null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(searchQuery.trim());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    // When input is cleared, trigger search with empty string to show all
    if (value === '') {
      onSearch?.('');
    }
  };

  const handleClear = () => {
    setSearchQuery('');
    onSearch?.(''); // Clear search results, show all
  };

  return (
    <form
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[500px] flex items-center gap-3 bg-gradient-to-r from-slate-900/90 to-slate-800/85 backdrop-blur-xl rounded-full border border-white/10 py-2 pr-2 pl-6 pointer-events-auto shadow-[0_4px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1),0_0_0_1px_rgba(59,130,246,0.3)]"
      onSubmit={handleSubmit}
    >
      <input
        type="text"
        className="flex-1 bg-transparent border-none outline-none text-white/90 text-[15px] py-2"
        value={searchQuery}
        onChange={handleInputChange}
        placeholder={displayPlaceholder}
      />
      {searchQuery && (
        <button
          type="button"
          className="w-8 h-8 rounded-full border-none bg-white/10 text-white/70 text-sm cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-white/20 hover:text-white"
          onClick={handleClear}
          title="Clear search"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      )}
      <button
        type="button"
        className="w-12 h-12 rounded-full border-none bg-orange-500 text-white text-lg cursor-pointer transition-all duration-200 flex items-center justify-center shadow-[0_4px_12px_rgba(249,115,22,0.4)] hover:bg-orange-600 hover:scale-105 active:scale-[0.98]"
        onClick={onVoiceClick}
        title="Voice Search"
      >
        <i className="fa-solid fa-microphone"></i>
      </button>
    </form>
  );
}
