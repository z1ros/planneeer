import { useState, useRef, useEffect } from 'react';

interface BottomSearchBarProps {
  onSearch?: (query: string) => void;
  onVoiceClick?: () => void;
}

export default function BottomSearchBar({ onSearch, onVoiceClick }: BottomSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch?.(query.trim());
    }
  };

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !isFocused && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused]);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto z-50 w-full max-w-lg px-4">
      {/* Main search bar */}
      <form onSubmit={handleSubmit}>
        <div className={`
          bg-[#1a1a2e]/90 backdrop-blur-xl rounded-full border overflow-hidden transition-all duration-300 flex items-center
          ${isFocused ? 'border-orange-500/50 shadow-lg shadow-orange-500/10' : 'border-white/10'}
        `}>
          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="What's possible with $45 today?"
            className="flex-1 py-4 px-6 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
          />

          {/* Voice button */}
          <button
            type="button"
            onClick={onVoiceClick}
            className="mr-2 w-11 h-11 bg-orange-500 hover:bg-orange-600 rounded-full flex items-center justify-center text-white transition-all duration-200 shadow-lg shadow-orange-500/30"
          >
            <i className="fa-solid fa-microphone text-lg"></i>
          </button>
        </div>
      </form>
    </div>
  );
}
