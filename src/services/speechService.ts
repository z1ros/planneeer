/**
 * Speech Service - Text-to-Speech for the app
 * Uses Web Speech API (built-in) with option for ElevenLabs
 */

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// Speech synthesis instance
let currentUtterance: SpeechSynthesisUtterance | null = null;
let isSpeaking = false;

/**
 * Stop any currently playing speech
 */
export function stopSpeaking(): void {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  currentUtterance = null;
}

/**
 * Check if currently speaking
 */
export function getIsSpeaking(): boolean {
  return isSpeaking || window.speechSynthesis?.speaking || false;
}

/**
 * Speak text using Web Speech API
 */
export function speak(text: string, options?: {
  rate?: number;
  pitch?: number;
  volume?: number;
  onEnd?: () => void;
  onStart?: () => void;
}): void {
  if (!window.speechSynthesis) {
    console.warn('[Speech] Speech synthesis not supported');
    return;
  }

  // Stop any current speech
  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Configure voice settings
  utterance.rate = options?.rate || 1.0;
  utterance.pitch = options?.pitch || 1.0;
  utterance.volume = options?.volume || 1.0;
  utterance.lang = 'en-US';

  // Try to get a good voice
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => 
    v.name.includes('Google') || 
    v.name.includes('Samantha') || 
    v.name.includes('Alex') ||
    v.name.includes('Microsoft')
  ) || voices.find(v => v.lang.startsWith('en'));
  
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onstart = () => {
    isSpeaking = true;
    options?.onStart?.();
  };

  utterance.onend = () => {
    isSpeaking = false;
    currentUtterance = null;
    options?.onEnd?.();
  };

  utterance.onerror = (event) => {
    console.error('[Speech] Error:', event);
    isSpeaking = false;
    currentUtterance = null;
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

/**
 * Speak an itinerary summary
 */
export function speakItinerary(itinerary: {
  title: string;
  overview: string;
  totalDuration: string;
  totalCost: string;
  stops: Array<{
    name: string;
    arrivalTime: string;
    duration: string;
    whyVisit?: string;
    transitToNext?: {
      duration: string;
      instructions: string;
    } | null;
  }>;
}): void {
  const parts: string[] = [];
  
  // Introduction
  parts.push(`Here's your itinerary: ${itinerary.title}.`);
  parts.push(itinerary.overview);
  parts.push(`Total duration: ${itinerary.totalDuration}. Estimated cost: ${itinerary.totalCost}.`);
  
  // Each stop
  itinerary.stops.forEach((stop, index) => {
    parts.push(`Stop ${index + 1}: ${stop.name}, arriving at ${stop.arrivalTime}, spending ${stop.duration}.`);
    if (stop.whyVisit) {
      parts.push(stop.whyVisit);
    }
    if (stop.transitToNext) {
      parts.push(`To get to the next stop: ${stop.transitToNext.instructions}`);
    }
  });
  
  parts.push("That's your complete itinerary. Have a great trip!");
  
  speak(parts.join(' '));
}

/**
 * Speak transit directions
 */
export function speakDirections(from: string, to: string, instructions: string, duration: string): void {
  const text = `To get from ${from} to ${to}, it will take about ${duration}. ${instructions}`;
  speak(text);
}

/**
 * Speak a suggestion/recommendation
 */
export function speakSuggestion(suggestion: string): void {
  speak(suggestion);
}

/**
 * Generate and speak an AI response for a conversational query
 */
export async function speakAIResponse(query: string, context?: string): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, context })
    });
    
    if (!response.ok) {
      throw new Error('Failed to get AI response');
    }
    
    const data = await response.json();
    const text = data.response || data.text || '';
    
    if (text) {
      speak(text);
    }
    
    return text;
  } catch (error) {
    console.error('[Speech] AI response error:', error);
    return '';
  }
}

// Load voices when available
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    console.log('[Speech] Voices loaded:', window.speechSynthesis.getVoices().length);
  };
}
