import { useState, useEffect, useRef, useCallback } from 'react';

type LayerType = 'transit' | 'restaurants' | 'events' | 'landmarks' | null;

interface BottomSearchBarProps {
  onSearch?: (query: string) => void;
  onVoiceClick?: () => void;
  onReservationRequest?: (message: string) => void;
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

// Reservation keyword patterns
const RESERVATION_PATTERNS = [
  /^book a reservation\s*(.*)/i,
  /^make a reservation\s*(.*)/i,
  /^reserve a table\s*(.*)/i,
  /^book a table\s*(.*)/i,
  /^book (?:at|for)\s*(.*)/i,
];

function detectReservationIntent(transcript: string): { isReservation: boolean; details: string } {
  const trimmed = transcript.trim();

  for (const pattern of RESERVATION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const details = match[1]?.trim() || '';
      console.log('[Voice] Reservation intent detected:', details || trimmed);
      return { isReservation: true, details: details || trimmed };
    }
  }

  return { isReservation: false, details: '' };
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
  onReservationRequest,
  placeholder,
  activeLayer
}: BottomSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeechTimeRef = useRef<number>(Date.now());
  const shouldKeepListeningRef = useRef<boolean>(false);
  const accumulatedTranscriptRef = useRef<string>('');

  // Use dynamic placeholder based on active layer, or custom placeholder if provided
  const displayPlaceholder = placeholder || getPlaceholder(activeLayer || null);

  // Initialize speech recognition with 3-second silence buffer
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; // Keep listening continuously
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      // Clear silence timeout helper
      const clearSilenceTimeout = () => {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      };

      // Start silence timeout - stops listening after 6 seconds of silence
      const startSilenceTimeout = () => {
        clearSilenceTimeout();
        silenceTimeoutRef.current = setTimeout(() => {
          console.log('[Voice] 6 seconds of silence - finalizing...');
          shouldKeepListeningRef.current = false;
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
        }, 6000); // 6 second silence buffer for better tolerance
      };

      recognition.onstart = () => {
        console.log('[Voice] Started listening (6s silence buffer active)...');
        setIsListening(true);
        setInterimTranscript('');
        lastSpeechTimeRef.current = Date.now();
        startSilenceTimeout(); // Start timeout when listening begins
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        // Reset silence timeout on any speech
        lastSpeechTimeRef.current = Date.now();
        startSilenceTimeout(); // Reset the 3-second timer

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

          // Check for reservation keywords
          const lowerFinal = final.toLowerCase();
          const reservationKeywords = [
            'book a reservation',
            'make a reservation',
            'reserve a table',
            'book a table',
            'make a booking',
            'reserve at',
            'book at',
            'reservation at',
            'reservation for'
          ];

          const isReservationRequest = reservationKeywords.some(keyword => lowerFinal.includes(keyword));

          if (isReservationRequest && onReservationRequest) {
            console.log('[Voice] Reservation keyword detected!');
            // Extract the restaurant/details part after the keyword
            let reservationDetails = final;
            for (const keyword of reservationKeywords) {
              if (lowerFinal.includes(keyword)) {
                const index = lowerFinal.indexOf(keyword);
                reservationDetails = final.substring(index + keyword.length).trim();
                break;
              }
            }
            // If no details extracted, use the full query
            if (!reservationDetails) {
              reservationDetails = final;
            }
            console.log('[Voice] Reservation details:', reservationDetails);
            setTimeout(() => {
              onReservationRequest(reservationDetails);
            }, 300);
          } else {
            // Regular search
            setTimeout(() => {
              onSearch?.(final.trim());
            }, 300);
          }
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onerror = (event) => {
        // Ignore 'no-speech' and 'aborted' errors - they're expected
        if (event.error === 'no-speech' || event.error === 'aborted') {
          console.log('[Voice] Expected event:', event.error);
          // On no-speech, restart if we should keep listening
          if (event.error === 'no-speech' && shouldKeepListeningRef.current) {
            console.log('[Voice] Restarting after no-speech...');
            setTimeout(() => {
              try {
                recognition.start();
              } catch (e) {
                console.log('[Voice] Could not restart:', e);
              }
            }, 100);
          }
        } else {
          console.error('[Voice] Error:', event.error);
          shouldKeepListeningRef.current = false;
          clearSilenceTimeout();
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        console.log('[Voice] Recognition ended, shouldKeepListening:', shouldKeepListeningRef.current);

        // Check if we should restart (browser stopped but user hasn't clicked stop)
        if (shouldKeepListeningRef.current) {
          console.log('[Voice] Auto-restarting recognition...');
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {
              console.log('[Voice] Could not restart:', e);
              shouldKeepListeningRef.current = false;
              clearSilenceTimeout();
              setIsListening(false);
            }
          }, 100);
          return;
        }

        // Actually stopping - finalize everything
        clearSilenceTimeout();
        setIsListening(false);

        // Auto-search with collected query
        const finalQuery = accumulatedTranscriptRef.current.trim();
        if (finalQuery) {
          console.log('[Voice] Final query:', finalQuery);
          setTimeout(() => {
            onSearch?.(finalQuery);
          }, 300);
        }
      };

      recognitionRef.current = recognition;
    } else {
      console.warn('[Voice] Speech recognition not supported in this browser');
    }

    return () => {
      shouldKeepListeningRef.current = false;
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [onSearch, onReservationRequest]);

  const handleVoiceButtonClick = useCallback(() => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser. Try Chrome or Edge.');
      onVoiceClick?.();
      return;
    }

    if (isListening) {
      // Stop listening immediately when button clicked
      console.log('[Voice] User clicked stop');
      shouldKeepListeningRef.current = false;
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      recognitionRef.current.stop();
    } else {
      try {
        // Clear previous query when starting new voice input
        console.log('[Voice] User clicked start');
        setSearchQuery('');
        setInterimTranscript('');
        accumulatedTranscriptRef.current = '';
        shouldKeepListeningRef.current = true; // Keep listening until 3s silence or user stops
        recognitionRef.current.start();
      } catch (err) {
        console.error('[Voice] Failed to start:', err);
        shouldKeepListeningRef.current = false;
      }
    }
  }, [isListening, onVoiceClick]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Check for reservation intent in typed input too
    const { isReservation, details } = detectReservationIntent(searchQuery);
    if (isReservation && onReservationRequest) {
      onReservationRequest(details);
      setSearchQuery('');
    } else {
      onSearch?.(searchQuery.trim());
    }
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
          className={`w-12 h-12 rounded-full border-none text-white text-lg cursor-pointer transition-all duration-200 flex items-center justify-center ${isListening
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
          Say: "Book a reservation at Carbone for tomorrow at 7pm" or "I want Indian food and a show"
        </p>
      )}
    </div>
  );
}

