/**
 * Speech Service - Text-to-Speech for the app
 * Uses ElevenLabs API with Bella voice
 */

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

// ElevenLabs Configuration
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const BELLA_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Bella - Natural, conversational
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// Audio state
let currentAudio: HTMLAudioElement | null = null;
let isSpeaking = false;

/**
 * Stop any currently playing speech
 */
export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  // Also stop Web Speech API as fallback
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
}

/**
 * Check if currently speaking
 */
export function getIsSpeaking(): boolean {
  return isSpeaking;
}

/**
 * Speak text using ElevenLabs API (with Web Speech fallback)
 */
export async function speak(text: string, options?: {
  onEnd?: () => void;
  onStart?: () => void;
}): Promise<void> {
  if (!text) return;

  // Stop any current speech
  stopSpeaking();

  // Try ElevenLabs first
  if (ELEVENLABS_API_KEY) {
    try {
      console.log('[Speech] Using ElevenLabs Bella voice');

      const response = await fetch(`${ELEVENLABS_API_URL}/${BELLA_VOICE_ID}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2_5', // Fast, high-quality model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      currentAudio = new Audio(audioUrl);

      currentAudio.onplay = () => {
        isSpeaking = true;
        options?.onStart?.();
      };

      currentAudio.onended = () => {
        isSpeaking = false;
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        options?.onEnd?.();
      };

      currentAudio.onerror = () => {
        console.error('[Speech] Audio playback error');
        isSpeaking = false;
        currentAudio = null;
        // Fallback to Web Speech API
        speakWithWebSpeech(text, options);
      };

      await currentAudio.play();
      return;

    } catch (error) {
      console.error('[Speech] ElevenLabs error, falling back to Web Speech:', error);
    }
  }

  // Fallback to Web Speech API
  speakWithWebSpeech(text, options);
}

/**
 * Fallback: Speak using Web Speech API
 */
function speakWithWebSpeech(text: string, options?: {
  onEnd?: () => void;
  onStart?: () => void;
}): void {
  if (!window.speechSynthesis) {
    console.warn('[Speech] Speech synthesis not supported');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  utterance.lang = 'en-US';

  // Try to get a good voice
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v =>
    v.name.includes('Google') ||
    v.name.includes('Samantha') ||
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
    options?.onEnd?.();
  };

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
      await speak(text);
    }

    return text;
  } catch (error) {
    console.error('[Speech] AI response error:', error);
    return '';
  }
}

// Load Web Speech voices when available (for fallback)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    console.log('[Speech] Web Speech voices loaded:', window.speechSynthesis.getVoices().length);
  };
}

console.log('[Speech] ElevenLabs Bella voice enabled:', !!ELEVENLABS_API_KEY);

