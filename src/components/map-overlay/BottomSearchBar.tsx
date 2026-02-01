import { useState, useEffect, useRef, useCallback } from 'react';

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
      return "Try: 'I want to visit Brooklyn Bridge, get sushi, and see a show'";
  }
}

// Speech Recognition types for TypeScript
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export default function BottomSearchBar({
  onSearch,
  onVoiceClick,
  placeholder,
  activeLayer
}: BottomSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Use dynamic placeholder based on active layer, or custom placeholder if provided
  const displayPlaceholder = placeholder || getPlaceholder(activeLayer || null);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('[Voice] Started listening...');
        setIsListening(true);
        setInterimTranscript('');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (final) {
          console.log('[Voice] Final transcript:', final);
          setSearchQuery(final);
          setInterimTranscript('');
          // Auto-search after voice input
          setTimeout(() => {
            onSearch?.(final.trim());
          }, 300);
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onerror = (event) => {
        console.error('[Voice] Error:', event.error);
        setIsListening(false);
        setInterimTranscript('');
      };

      recognition.onend = () => {
        console.log('[Voice] Stopped listening');
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      console.warn('[Voice] Speech recognition not supported in this browser');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [onSearch]);

  const handleVoiceButtonClick = useCallback(() => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser. Try Chrome or Edge.');
      onVoiceClick?.();
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('[Voice] Failed to start:', err);
      }
    }
  }, [isListening, onVoiceClick]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
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
    setInterimTranscript('');
    onSearch?.(''); // Clear search results, show all
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[550px] pointer-events-auto">
      {/* Listening indicator */}
      {isListening && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 animate-pulse shadow-lg">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
          </span>
          Listening... Speak now
        </div>
      )}
      
      <form
        className={`flex items-center gap-3 bg-gradient-to-r from-slate-900/90 to-slate-800/85 backdrop-blur-xl rounded-full border ${isListening ? 'border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.4)]' : 'border-white/10'} py-2 pr-2 pl-6 shadow-[0_4px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300`}
        onSubmit={handleSubmit}
      >
        <input
          type="text"
          className="flex-1 bg-transparent border-none outline-none text-white/90 text-[15px] py-2"
          value={isListening && interimTranscript ? interimTranscript : searchQuery}
          onChange={handleInputChange}
          placeholder={isListening ? 'Listening...' : displayPlaceholder}
          readOnly={isListening}
        />
        {(searchQuery || interimTranscript) && (
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
          className={`w-12 h-12 rounded-full border-none text-white text-lg cursor-pointer transition-all duration-200 flex items-center justify-center ${
            isListening 
              ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse' 
              : 'bg-orange-500 shadow-[0_4px_12px_rgba(249,115,22,0.4)] hover:bg-orange-600 hover:scale-105 active:scale-[0.98]'
          }`}
          onClick={handleVoiceButtonClick}
          title={isListening ? 'Stop listening' : 'Voice Search - Click and speak'}
        >
          <i className={`fa-solid ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i>
        </button>
      </form>
      
      {/* Voice tips */}
      {!isListening && !searchQuery && (
        <p className="text-center text-white/30 text-[11px] mt-2">
          Click the mic and say: "I want to visit Brooklyn Bridge, get Indian food, and see a football game"
        </p>
      )}
    </div>
  );
}
