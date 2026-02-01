import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Map3D, { LayerType } from './components/Map3D';
import MapErrorBoundary from './components/MapErrorBoundary';
import { LeftSidebar, RightItineraryPanel, BottomSearchBar, ItineraryItem, BudgetData } from './components/map-overlay';
import WelcomeScreen from './components/WelcomeScreen';
import LoadingScreen from './components/LoadingScreen';
import { ItineraryEvent } from './types';
import { getSmartPlan, performSearch, buildDetailedItinerary, createItineraryFromQuery, isItineraryQuery, SmartPlanResponse, PlanData, SearchResponse, SearchResult, SearchType, DetailedItinerary, DetailedStop } from './services/plannerApi';
import './App.css';
import './styles/industrial.css';

export interface CitySettings {
  timeOfDay: number;
  weather: 'clear' | 'rain' | 'snow' | 'fog';
  fogDensity: number;
  buildingGlow: number;
  trafficDensity: number;
  cameraMode: 'free' | 'helicopter' | 'street' | 'drone' | 'cinematic';
  showTransit: boolean;
  showStreetLights: boolean;
  glitchEffect: boolean;
  neonMode: boolean;
}

export interface TripDates {
  startDate: string;
  endDate: string;
  specifyTimes: boolean;
  arrivalTime: string;
  leaveTime: string;
}

export interface WalkingPreferences {
  walkingTimeMinutes: number;
  walkingDistanceMiles: number;
}

// Convert ItineraryEvent to ItineraryItem for the overlay UI
function eventToOverlayItem(event: ItineraryEvent, index: number): ItineraryItem {
  const typeConfig: Record<string, { icon: string; iconBg: string }> = {
    restaurant: { icon: 'fa-utensils', iconBg: '#ec4899' },
    event: { icon: 'fa-calendar', iconBg: '#8b5cf6' },
    landmark: { icon: 'fa-landmark', iconBg: '#ef4444' },
    transit: { icon: 'fa-train-subway', iconBg: '#3b82f6' },
    attraction: { icon: 'fa-star', iconBg: '#f97316' },
    food: { icon: 'fa-utensils', iconBg: '#ec4899' },
  };

  const config = typeConfig[event.category] || typeConfig.attraction;

  return {
    id: event.id,
    type: event.category as ItineraryItem['type'],
    name: event.name,
    duration: event.duration ? `${event.duration} min` : undefined,
    price: event.eventData?.price ? `$${event.eventData.price}` : undefined,
    icon: config.icon,
    iconBg: config.iconBg,
    address: event.eventData?.venue?.name || '',
    description: event.vibe,
    rating: undefined, // Fixed: ItineraryEvent doesn't have rating in the current interface
    tags: event.eventData?.categories || [],
  };
}

// Main Layout - LeftSidebar is always present
function MainLayout() {
  return (
    <div className="app-fullscreen relative">
      {/* Main Content Area - Changes based on route */}
      <Outlet />

      {/* Left Sidebar - Always visible, on top with z-index */}
      <div className="absolute inset-0 pointer-events-none z-50">
        <LeftSidebar />
      </div>
    </div>
  );
}

// Placeholder pages for routes
function JourneyPage() {
  return (
    <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
      <div className="text-center text-white">
        <i className="fa-solid fa-route text-6xl text-orange-500 mb-4"></i>
        <h1 className="text-3xl font-bold mb-2">Journey Planner</h1>
        <p className="text-white/60">Plan your perfect trip itinerary</p>
      </div>
    </div>
  );
}

interface MatchUser {
  name: string;
  age: number;
  hometown: string;
  interestOptions: string[];
  interestFreeText?: string;
  description?: string;
  photoUrl?: string;
  instagram?: string;
}

interface Match {
  user: MatchUser;
  sharedTags: string[];
  sharedCount: number;
  ageDiff: number;
}

interface MatchesResponse {
  viewer: MatchUser;
  matches: Match[];
}

function NetworkPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:3000/api/matches/get-matches?limit=10');
      if (!response.ok) throw new Error('Failed to fetch matches');
      const data: MatchesResponse = await response.json();

      // Shuffle and pick 3 random matches
      const shuffled = data.matches.sort(() => Math.random() - 0.5);
      setMatches(shuffled.slice(0, 3));
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* Main Content */}
      <div className="absolute inset-0 pl-24 pr-6 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Find Travel Buddies</h1>
          <p className="text-white/40 text-sm">Connect with travelers who share your interests</p>
        </div>

        {/* Search Section - Always visible */}
        <div className="mb-8 bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-[0_4px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <i className="fa-solid fa-magnifying-glass text-orange-500 text-lg"></i>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Who do you want to meet?</h2>
                <p className="text-white/40 text-sm">Describe the kind of traveler you're looking for</p>
              </div>
            </div>

            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g., I want to meet someone from Boston who loves hiking..."
                  className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !searchQuery.trim()}
                className="px-6 py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <i className="fa-solid fa-spinner fa-spin"></i>
                ) : (
                  <i className="fa-solid fa-search"></i>
                )}
                Search
              </button>
            </form>

            {/* Quick suggestions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-white/30 text-xs">Try:</span>
              {['hiking enthusiasts', 'foodies in NYC', 'photography lovers', 'coffee addicts'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setSearchQuery(`I want to meet ${suggestion}`)}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 text-xs rounded-lg border border-white/10 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
            <i className="fa-solid fa-exclamation-circle text-red-500"></i>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
              <div className="text-center text-white">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <i className="fa-solid fa-spinner fa-spin text-2xl text-orange-500"></i>
                </div>
                <p className="text-white/60 text-sm">Finding travelers for you...</p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State - Before search */}
        {!loading && !hasSearched && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="text-center max-w-md">
              <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center border border-orange-500/20">
                <i className="fa-solid fa-users text-4xl text-orange-500/60"></i>
              </div>
              <h2 className="text-xl font-medium text-white/70 mb-2">Start Your Search</h2>
              <p className="text-white/40 text-sm leading-relaxed">
                Tell us who you'd like to meet and we'll find travelers that match your interests
              </p>
            </div>
          </div>
        )}

        {/* Results Section */}
        {!loading && hasSearched && (
          <>
            {/* Section Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
              <span className="text-white/30 text-xs uppercase tracking-widest">
                {matches.length} {matches.length === 1 ? 'Person' : 'People'} Found
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
            </div>

            {/* Matches Grid */}
            {matches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {matches.map((match, index) => {
                  const isExpanded = expandedId === index;

                  return (
                    <div
                      key={index}
                      className={`bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border overflow-hidden transition-all duration-300 cursor-pointer group shadow-[0_4px_30px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] ${
                        isExpanded ? 'border-orange-500/50 scale-[1.02]' : 'border-white/10 hover:border-white/20'
                      }`}
                      onClick={() => setExpandedId(isExpanded ? null : index)}
                    >
                      {/* Card Header with Photo */}
                      <div className="relative">
                        {/* Background gradient */}
                        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                        <div className="p-4 flex items-start gap-4">
                          {/* Avatar - Larger */}
                          <div className="relative shrink-0">
                            <div className={`w-20 h-20 rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
                              isExpanded ? 'border-orange-500/70 shadow-[0_0_20px_rgba(249,115,22,0.3)]' : 'border-white/10 group-hover:border-white/20'
                            }`}>
                              {match.user.photoUrl ? (
                                <img src={match.user.photoUrl} alt={match.user.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-2xl font-semibold">
                                  {match.user.name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* User Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="text-white font-semibold text-lg">{match.user.name}</h3>
                                <div className="flex items-center gap-2 text-white/40 text-sm mt-1">
                                  {match.user.age && <span>{match.user.age} years old</span>}
                                  {match.user.hometown && (
                                    <>
                                      <span className="text-white/20">•</span>
                                      <span className="truncate">{match.user.hometown}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Match Score */}
                              <div className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                                match.sharedCount >= 3
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : match.sharedCount >= 2
                                    ? 'bg-orange-500/20 text-orange-400'
                                    : 'bg-white/10 text-white/50'
                              }`}>
                                <i className="fa-solid fa-heart text-[10px]"></i>
                                {match.sharedCount} shared
                              </div>
                            </div>

                            {/* Description */}
                            {match.user.description && (
                              <p className="text-white/50 text-sm mt-3 line-clamp-2 leading-relaxed">{match.user.description}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Shared Interests - Always visible */}
                      {match.sharedTags.length > 0 && (
                        <div className="px-4 pb-4">
                          <p className="text-white/30 text-[10px] uppercase tracking-wider mb-2">Shared Interests</p>
                          <div className="flex flex-wrap gap-2">
                            {match.sharedTags.map((tag, idx) => (
                              <span key={idx} className="px-3 py-1.5 bg-orange-500/20 text-orange-300 text-xs font-medium rounded-lg flex items-center gap-1.5">
                                <i className="fa-solid fa-check text-[10px]"></i>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expanded Content */}
                      <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="px-4 pb-4 pt-3 border-t border-white/10">
                          {/* Other Interests */}
                          {match.user.interestOptions && match.user.interestOptions.filter(t => !match.sharedTags.includes(t)).length > 0 && (
                            <div className="mb-4">
                              <p className="text-white/30 text-[10px] uppercase tracking-wider mb-2">Also interested in</p>
                              <div className="flex flex-wrap gap-2">
                                {match.user.interestOptions
                                  .filter(tag => !match.sharedTags.includes(tag))
                                  .map((tag, idx) => (
                                    <span key={idx} className="px-3 py-1.5 bg-white/5 text-white/50 text-xs rounded-lg">
                                      {tag}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}

                          {/* Instagram Link */}
                          {match.user.instagram && (
                            <a
                              href={`https://instagram.com/${match.user.instagram}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-orange-500/20 hover:from-purple-500/30 hover:via-pink-500/30 hover:to-orange-500/30 rounded-xl border border-white/10 hover:border-pink-500/30 transition-all group"
                            >
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                                <i className="fa-brands fa-instagram text-white text-lg"></i>
                              </div>
                              <div className="flex-1">
                                <p className="text-white text-sm font-medium">@{match.user.instagram}</p>
                                <p className="text-white/40 text-xs">View Instagram profile</p>
                              </div>
                              <i className="fa-solid fa-arrow-up-right-from-square text-white/30 group-hover:text-white/60 transition-colors"></i>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 p-10 text-center shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                    <i className="fa-solid fa-user-slash text-3xl text-white/20"></i>
                  </div>
                  <h2 className="text-xl font-medium text-white/60 mb-2">No matches found</h2>
                  <p className="text-white/40 text-sm max-w-xs">Try a different search to find more travelers</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Settings interfaces
interface UserProfile {
  name: string;
  email: string;
  phone: string;
  avatar: string;
  homeCity: string;
  bio: string;
}

interface TravelPreferences {
  maxWalkingMinutes: number;
  preferredBudget: 'budget' | 'moderate' | 'premium';
  dietaryRestrictions: string[];
  accessibilityNeeds: boolean;
  preferOutdoor: boolean;
  avoidCrowds: boolean;
}

function SettingsPage() {
  // Fake user profile data
  const [profile, setProfile] = useState<UserProfile>({
    name: 'Alex Rivera',
    email: 'alex.rivera@email.com',
    phone: '+1 (555) 123-4567',
    avatar: '',
    homeCity: 'New York, NY',
    bio: 'Adventure seeker & coffee enthusiast. Always planning the next trip!'
  });

  // Travel preferences
  const [travelPrefs, setTravelPrefs] = useState<TravelPreferences>({
    maxWalkingMinutes: 15,
    preferredBudget: 'moderate',
    dietaryRestrictions: ['Vegetarian'],
    accessibilityNeeds: false,
    preferOutdoor: true,
    avoidCrowds: false
  });

  // Active section
  const [activeSection, setActiveSection] = useState<'profile' | 'travel'>('profile');

  // Toast for save confirmation
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = () => {
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const dietaryOptions = [
    { name: 'Vegetarian', icon: 'fa-leaf' },
    { name: 'Vegan', icon: 'fa-seedling' },
    { name: 'Gluten-Free', icon: 'fa-wheat-awn-circle-exclamation' },
    { name: 'Halal', icon: 'fa-drumstick-bite' },
    { name: 'Kosher', icon: 'fa-star-of-david' },
    { name: 'Dairy-Free', icon: 'fa-glass-water' },
    { name: 'Nut-Free', icon: 'fa-ban' },
  ];

  // Walking slider progress
  const walkingProgress = ((travelPrefs.maxWalkingMinutes - 5) / 40) * 100;

  const toggleDietary = (option: string) => {
    setTravelPrefs(prev => ({
      ...prev,
      dietaryRestrictions: prev.dietaryRestrictions.includes(option)
        ? prev.dietaryRestrictions.filter(d => d !== option)
        : [...prev.dietaryRestrictions, option]
    }));
  };

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-40 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* Save Toast - Enhanced */}
      <div className={`fixed top-6 right-6 z-50 transition-all duration-500 ${showSaved ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95 pointer-events-none'}`}>
        <div className="bg-emerald-500/20 border border-emerald-500/50 backdrop-blur-xl rounded-2xl px-5 py-4 flex items-center gap-4 shadow-[0_8px_32px_rgba(16,185,129,0.3)]">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <i className="fa-solid fa-check text-white text-lg"></i>
          </div>
          <div>
            <span className="text-emerald-300 font-semibold block">Saved!</span>
            <span className="text-emerald-400/60 text-xs">Settings updated successfully</span>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pl-24 pr-6 py-6 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-orange-500/50 [&::-webkit-scrollbar-thumb]:rounded-full">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-white mb-1">Settings</h1>
          <p className="text-white/40 text-sm">Personalize your travel experience</p>
        </div>

        <div className="flex gap-6">
          {/* Enhanced Left Navigation */}
          <div className="w-60 shrink-0">
            <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              {/* User Mini Profile */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                    <span className="text-lg font-bold text-white">{profile.name.split(' ').map(n => n[0]).join('')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium text-sm truncate">{profile.name}</div>
                    <div className="text-white/40 text-xs truncate">{profile.email}</div>
                  </div>
                </div>
              </div>

              <nav className="p-2">
                {[
                  { id: 'profile', icon: 'fa-user', label: 'Profile' },
                  { id: 'travel', icon: 'fa-suitcase-rolling', label: 'Travel Preferences' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id as any)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-300 group ${
                      activeSection === item.id
                        ? 'bg-orange-500/20 text-white shadow-lg'
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
                      activeSection === item.id ? 'bg-orange-500/30' : 'bg-white/5 group-hover:bg-white/10'
                    }`}>
                      <i className={`fa-solid ${item.icon} text-sm ${activeSection === item.id ? 'text-orange-400' : 'opacity-60 group-hover:opacity-100'}`}></i>
                    </div>
                    <span>{item.label}</span>
                    {activeSection === item.id && <i className="fa-solid fa-chevron-right ml-auto text-xs opacity-50"></i>}
                  </button>
                ))}
              </nav>
            </div>

          </div>

          {/* Right Content */}
          <div className="flex-1 max-w-2xl">
            {/* Profile Section - Enhanced */}
            {activeSection === 'profile' && (
              <div className="space-y-6">
                {/* Avatar & Basic Info */}
                <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  {/* Decorative header */}
                  <div className="h-24 bg-gradient-to-r from-orange-500/20 via-pink-500/20 to-purple-500/20 relative">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50"></div>
                  </div>

                  <div className="px-6 pb-6 -mt-12">
                    {/* Avatar */}
                    <div className="flex items-end gap-5 mb-6">
                      <div className="relative group">
                        <div className="w-28 h-28 rounded-2xl bg-orange-500 flex items-center justify-center border-4 border-slate-900 shadow-xl shadow-orange-500/20 transition-transform group-hover:scale-105">
                          <span className="text-4xl font-bold text-white">{profile.name.split(' ').map(n => n[0]).join('')}</span>
                        </div>
                        <button className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all shadow-lg">
                          <i className="fa-solid fa-camera text-sm"></i>
                        </button>
                      </div>
                      <div className="pb-2">
                        <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                        <p className="text-white/40 text-sm flex items-center gap-2">
                          <i className="fa-solid fa-location-dot text-orange-400"></i>
                          {profile.homeCity}
                        </p>
                      </div>
                    </div>

                    {/* Form Fields - Enhanced */}
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="group">
                          <label className="block text-white/40 text-xs uppercase tracking-wider mb-2 group-focus-within:text-orange-400 transition-colors">Full Name</label>
                          <div className="relative">
                            <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-orange-400 transition-colors"></i>
                            <input
                              type="text"
                              value={profile.name}
                              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                              className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500/50 focus:bg-orange-500/5 transition-all"
                            />
                          </div>
                        </div>
                        <div className="group">
                          <label className="block text-white/40 text-xs uppercase tracking-wider mb-2 group-focus-within:text-orange-400 transition-colors">Home City</label>
                          <div className="relative">
                            <i className="fa-solid fa-location-dot absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-orange-400 transition-colors"></i>
                            <input
                              type="text"
                              value={profile.homeCity}
                              onChange={(e) => setProfile({ ...profile, homeCity: e.target.value })}
                              className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500/50 focus:bg-orange-500/5 transition-all"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-white/40 text-xs uppercase tracking-wider mb-2 group-focus-within:text-orange-400 transition-colors">Email Address</label>
                        <div className="relative">
                          <i className="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-orange-400 transition-colors"></i>
                          <input
                            type="email"
                            value={profile.email}
                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                            className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500/50 focus:bg-orange-500/5 transition-all"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 text-xs flex items-center gap-1">
                            <i className="fa-solid fa-circle-check"></i> Verified
                          </span>
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-white/40 text-xs uppercase tracking-wider mb-2 group-focus-within:text-orange-400 transition-colors">Phone Number</label>
                        <div className="relative">
                          <i className="fa-solid fa-phone absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-orange-400 transition-colors"></i>
                          <input
                            type="tel"
                            value={profile.phone}
                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                            className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500/50 focus:bg-orange-500/5 transition-all"
                          />
                        </div>
                      </div>

                      <div className="group">
                        <label className="block text-white/40 text-xs uppercase tracking-wider mb-2 group-focus-within:text-orange-400 transition-colors">Bio</label>
                        <div className="relative">
                          <textarea
                            value={profile.bio}
                            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                            rows={3}
                            placeholder="Tell us about yourself..."
                            className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500/50 focus:bg-orange-500/5 transition-all resize-none"
                          />
                          <span className="absolute right-3 bottom-3 text-white/20 text-xs">{profile.bio.length}/200</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button - Enhanced */}
                <button
                  onClick={handleSave}
                  className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <i className="fa-solid fa-save"></i>
                  Save Changes
                </button>
              </div>
            )}

            {/* Travel Preferences Section - Enhanced */}
            {activeSection === 'travel' && (
              <div className="space-y-6">
                {/* Walking & Budget */}
                <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/30 to-emerald-600/20 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                        <i className="fa-solid fa-route text-emerald-400 text-lg"></i>
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Trip Preferences</h2>
                        <p className="text-white/40 text-sm">Customize how we plan your adventures</p>
                      </div>
                    </div>

                    <div className="space-y-8">
                      {/* Walking Distance - Enhanced Slider */}
                      <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                              <i className="fa-solid fa-person-walking text-orange-400"></i>
                            </div>
                            <div>
                              <label className="text-white font-medium text-sm">Maximum Walking Time</label>
                              <p className="text-white/40 text-xs">Per leg of your journey</p>
                            </div>
                          </div>
                          <div className="bg-orange-500/20 px-4 py-2 rounded-xl">
                            <span className="text-orange-400 font-bold text-lg">{travelPrefs.maxWalkingMinutes}</span>
                            <span className="text-orange-400/60 text-sm ml-1">min</span>
                          </div>
                        </div>

                        {/* Custom Visual Slider */}
                        <div className="relative h-3 mt-6 mb-2">
                          <div className="absolute inset-0 bg-white/10 rounded-full"></div>
                          <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-200" style={{ width: `${walkingProgress}%` }}></div>
                          <input
                            type="range"
                            min="5"
                            max="45"
                            step="5"
                            value={travelPrefs.maxWalkingMinutes}
                            onChange={(e) => setTravelPrefs({ ...travelPrefs, maxWalkingMinutes: parseInt(e.target.value) })}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                          <div className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-lg shadow-orange-500/30 border-2 border-orange-500 transition-all duration-200 pointer-events-none" style={{ left: `calc(${walkingProgress}% - 12px)` }}></div>
                        </div>
                        <div className="flex justify-between text-white/30 text-xs px-1">
                          <span>5 min</span>
                          <span>15 min</span>
                          <span>30 min</span>
                          <span>45 min</span>
                        </div>
                      </div>

                      {/* Budget Preference - Enhanced Cards */}
                      <div>
                        <label className="text-white/70 text-sm mb-4 block flex items-center gap-2">
                          <i className="fa-solid fa-coins text-yellow-500"></i>
                          Default Budget Level
                        </label>
                        <div className="grid grid-cols-3 gap-4">
                          {[
                            { id: 'budget', label: 'Budget', icon: 'fa-piggy-bank', desc: '$0-50/day', gradient: 'from-emerald-500/20 to-emerald-600/10' },
                            { id: 'moderate', label: 'Moderate', icon: 'fa-wallet', desc: '$50-150/day', gradient: 'from-orange-500/20 to-orange-600/10' },
                            { id: 'premium', label: 'Premium', icon: 'fa-gem', desc: '$150+/day', gradient: 'from-purple-500/20 to-purple-600/10' },
                          ].map((option) => (
                            <button
                              key={option.id}
                              onClick={() => setTravelPrefs({ ...travelPrefs, preferredBudget: option.id as any })}
                              className={`relative p-5 rounded-2xl border-2 transition-all duration-300 text-center group overflow-hidden ${
                                travelPrefs.preferredBudget === option.id
                                  ? 'border-orange-500 scale-[1.02] shadow-lg shadow-orange-500/20'
                                  : 'border-white/10 hover:border-white/20 hover:scale-[1.01]'
                              }`}
                            >
                              <div className={`absolute inset-0 bg-gradient-to-br ${option.gradient} transition-opacity ${travelPrefs.preferredBudget === option.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}></div>
                              <div className="relative">
                                {travelPrefs.preferredBudget === option.id && (
                                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                                    <i className="fa-solid fa-check text-white text-[10px]"></i>
                                  </div>
                                )}
                                <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3 transition-all ${
                                  travelPrefs.preferredBudget === option.id ? 'bg-orange-500 shadow-lg shadow-orange-500/30' : 'bg-white/10 group-hover:bg-white/15'
                                }`}>
                                  <i className={`fa-solid ${option.icon} text-xl ${travelPrefs.preferredBudget === option.id ? 'text-white' : 'text-white/60'}`}></i>
                                </div>
                                <div className={`font-semibold text-sm mb-1 ${travelPrefs.preferredBudget === option.id ? 'text-white' : 'text-white/70'}`}>{option.label}</div>
                                <div className={`text-xs ${travelPrefs.preferredBudget === option.id ? 'text-orange-400' : 'text-white/40'}`}>{option.desc}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Toggle Options - Enhanced */}
                      <div className="space-y-3 pt-4 border-t border-white/10">
                        <p className="text-white/40 text-xs uppercase tracking-wider mb-4">Additional Preferences</p>
                        {[
                          { key: 'accessibilityNeeds', label: 'Accessibility Requirements', desc: 'Prioritize wheelchair-accessible locations', icon: 'fa-wheelchair' },
                          { key: 'preferOutdoor', label: 'Prefer Outdoor Activities', desc: 'Suggest more parks, walks, and outdoor venues', icon: 'fa-sun' },
                          { key: 'avoidCrowds', label: 'Avoid Crowded Places', desc: 'Skip popular tourist spots during peak hours', icon: 'fa-user-group' },
                        ].map((option) => (
                          <div
                            key={option.key}
                            className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-300 cursor-pointer group ${
                              travelPrefs[option.key as keyof TravelPreferences] ? 'bg-white/5 border-white/10' : 'border-transparent hover:bg-white/5'
                            }`}
                            onClick={() => setTravelPrefs({ ...travelPrefs, [option.key]: !travelPrefs[option.key as keyof TravelPreferences] })}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                                travelPrefs[option.key as keyof TravelPreferences] ? 'bg-orange-500/20' : 'bg-white/5 group-hover:bg-white/10'
                              }`}>
                                <i className={`fa-solid ${option.icon} ${travelPrefs[option.key as keyof TravelPreferences] ? 'text-orange-400' : 'text-white/40'}`}></i>
                              </div>
                              <div>
                                <div className={`text-sm font-medium transition-colors ${travelPrefs[option.key as keyof TravelPreferences] ? 'text-white' : 'text-white/70'}`}>{option.label}</div>
                                <div className="text-white/40 text-xs">{option.desc}</div>
                              </div>
                            </div>
                            <div className={`w-14 h-8 rounded-full transition-all duration-300 relative ${
                              travelPrefs[option.key as keyof TravelPreferences] ? 'bg-gradient-to-r from-orange-500 to-orange-400 shadow-lg shadow-orange-500/30' : 'bg-white/20'
                            }`}>
                              <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ${
                                travelPrefs[option.key as keyof TravelPreferences] ? 'left-7' : 'left-1'
                              }`}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dietary Restrictions - Enhanced with Emojis */}
                <div className="bg-gradient-to-b from-slate-800/80 to-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/30 to-emerald-600/20 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                        <i className="fa-solid fa-utensils text-emerald-400 text-lg"></i>
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-bold text-white">Dietary Preferences</h2>
                        <p className="text-white/40 text-sm">Help us find the right restaurants for you</p>
                      </div>
                      <span className="px-3 py-1.5 bg-emerald-500/20 rounded-lg text-emerald-400 text-xs font-medium">
                        {travelPrefs.dietaryRestrictions.length} selected
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {dietaryOptions.map((option) => (
                        <button
                          key={option.name}
                          onClick={() => toggleDietary(option.name)}
                          className={`relative p-4 rounded-xl border-2 transition-all duration-300 text-left group overflow-hidden ${
                            travelPrefs.dietaryRestrictions.includes(option.name)
                              ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                              : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                          }`}
                        >
                          {travelPrefs.dietaryRestrictions.includes(option.name) && (
                            <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                              <i className="fa-solid fa-check text-white text-[10px]"></i>
                            </div>
                          )}
                          <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center transition-all ${
                            travelPrefs.dietaryRestrictions.includes(option.name)
                              ? 'bg-emerald-500/20'
                              : 'bg-white/5 group-hover:bg-white/10'
                          }`}>
                            <i className={`fa-solid ${option.icon} text-lg ${
                              travelPrefs.dietaryRestrictions.includes(option.name) ? 'text-emerald-400' : 'text-white/40'
                            }`}></i>
                          </div>
                          <span className={`text-sm font-medium ${travelPrefs.dietaryRestrictions.includes(option.name) ? 'text-white' : 'text-white/60'}`}>{option.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Save Button - Enhanced */}
                <button
                  onClick={handleSave}
                  className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <i className="fa-solid fa-save"></i>
                  Save Changes
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const defaultBudget: BudgetData = {
  food: 0,
  activity: 0,
  transit: 0,
};

function MapPage() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [voiceOnboardingActive, setVoiceOnboardingActive] = useState(false);

  const [settings] = useState<CitySettings>({
    timeOfDay: 20,
    weather: 'clear',
    fogDensity: 0.5,
    buildingGlow: 0.8,
    trafficDensity: 0.6,
    cameraMode: 'free',
    showTransit: true,
    showStreetLights: true,
    glitchEffect: false,
    neonMode: true,
  });

  const [selectedLocation, setSelectedLocation] = useState<{
    location: [number, number];
    name: string;
  } | null>(null);

  const [itineraryEvents, setItineraryEvents] = useState<ItineraryEvent[]>([]);

  // Saved items for manual itinerary building
  const [savedItems, setSavedItems] = useState<ItineraryItem[]>([]);
  const [isBuildingItinerary, setIsBuildingItinerary] = useState(false);
  const [detailedItinerary, setDetailedItinerary] = useState<DetailedItinerary | null>(null);

  // Smart planner state
  const [isSearching, setIsSearching] = useState(false);
  const [plans, setPlans] = useState<{ A: PlanData; B: PlanData } | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [activePlan, setActivePlan] = useState<'A' | 'B'>('A');
  const [totalBudgetAmount, setTotalBudgetAmount] = useState<number | null>(null); // No default - only set when user specifies
  const [budget, setBudget] = useState<BudgetData>(defaultBudget);

  const [mapCommand, setMapCommand] = useState<{
    action: 'zoom_in' | 'zoom_out' | 'fly_to';
    location?: string;
    timestamp: number;
  } | null>(null);

  const [itineraryRouteData, setItineraryRouteData] = useState<any>(null);

  // Active map layer state - controls which category to filter search results by
  const [activeLayer, setActiveLayer] = useState<LayerType>(null);

  // User location - default to 200 W 26th St, NYC (Flatiron District)
  const [userLocation] = useState<{ lat: number; lng: number; address: string }>({
    lat: 40.7448,
    lng: -73.9932,
    address: '200 W 26th St, New York, NY 10001'
  });

  const handleDisplayStart = useCallback((mode: 'voice' | 'chat') => {
    setShowWelcome(false);
    if (mode === 'voice') {
      setVoiceOnboardingActive(true);
    }
  }, []);

  // Vector search handler - calls the new semantic search endpoint
  // Filters by active layer type (restaurants, events, landmarks) when one is selected
  const handleSearch = useCallback(async (query: string) => {
    // If query is empty, clear search results and show all
    if (!query || query.trim() === '') {
      setSearchResults(null);
      setPlans(null);
      setItineraryRouteData(null);
      setDetailedItinerary(null);
      return;
    }

    setIsSearching(true);
    setPlans(null);
    setItineraryRouteData(null);

    try {
      // Check if this looks like an itinerary request
      if (isItineraryQuery(query)) {
        console.log('[App] Detected itinerary query, creating plan:', query);
        setSearchResults(null);
        setDetailedItinerary(null);
        
        const response = await createItineraryFromQuery(query, {
          lat: userLocation.lat,
          lng: userLocation.lng,
          address: userLocation.address
        });
        
        if (response.success && response.itinerary) {
          setDetailedItinerary(response.itinerary);
          setBudget(response.budget);
          
          // Set route on map
          const routePoints = [
            { lat: userLocation.lat, lng: userLocation.lng, name: 'Start', type: 'start' },
            ...response.itinerary.stops
              .filter(stop => stop.coordinates)
              .map(stop => ({
                lat: stop.coordinates!.lat,
                lng: stop.coordinates!.lng,
                name: stop.name,
                type: stop.type
              }))
          ];
          
          if (routePoints.length >= 2) {
            setItineraryRouteData({ points: routePoints });
          }
          
          console.log('[App] Itinerary created:', response.itinerary.title);
        }
      } else {
        // Regular search
        const searchType: SearchType = activeLayer === 'restaurants' || activeLayer === 'events' || activeLayer === 'landmarks'
          ? activeLayer
          : null;

        console.log('[App] Performing vector search:', query, '| Filter:', searchType || 'all');
        setDetailedItinerary(null);
        
        const response = await performSearch(query, 30, searchType);
        console.log('[App] Search results:', response);
        setSearchResults(response);
      }
    } catch (error) {
      console.error('[App] Search/Itinerary failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [activeLayer, userLocation]);

  // Clear search results - exposed for clearing from search bar
  const handleClearSearch = useCallback(() => {
    setSearchResults(null);
  }, []);

  // Add item to saved itinerary list
  const handleAddToItinerary = useCallback((item: {
    id: string;
    name: string;
    type: 'restaurant' | 'event' | 'landmark';
    description?: string;
    address?: string;
    price?: string;
    rating?: number;
    coordinates?: { lat: number; lng: number };
    category?: string;
  }) => {
    setSavedItems(prev => {
      // Check if item already exists
      if (prev.some(i => i.id === item.id)) {
        console.log('[App] Item already in itinerary:', item.name);
        return prev;
      }
      
      // Map type to icon and category
      const typeMap = {
        restaurant: { icon: 'fa-utensils', iconBg: 'bg-orange-500', category: 'food' as const },
        event: { icon: 'fa-calendar-star', iconBg: 'bg-purple-500', category: 'activity' as const },
        landmark: { icon: 'fa-landmark', iconBg: 'bg-blue-500', category: 'activity' as const }
      };
      
      const config = typeMap[item.type] || typeMap.landmark;
      
      const newItem: ItineraryItem = {
        id: item.id,
        name: item.name,
        type: item.type === 'restaurant' ? 'food' : item.type === 'event' ? 'event' : 'landmark',
        description: item.description,
        address: item.address,
        price: item.price,
        priceRange: item.price,
        rating: item.rating,
        icon: config.icon,
        iconBg: config.iconBg,
        category: config.category,
        coordinates: item.coordinates,
        tags: item.category ? [item.category] : []
      };
      
      console.log('[App] Added to itinerary:', item.name);
      return [...prev, newItem];
    });
  }, []);

  // Remove item from saved itinerary
  const handleRemoveFromItinerary = useCallback((itemId: string) => {
    setSavedItems(prev => prev.filter(item => item.id !== itemId));
  }, []);

  // Clear all saved items
  const handleClearSavedItems = useCallback(() => {
    setSavedItems([]);
  }, []);

  // Build detailed itinerary from saved items using Gemini
  const handleBuildItinerary = useCallback(async () => {
    if (savedItems.length === 0) return;
    
    setIsBuildingItinerary(true);
    
    try {
      const itemNames = savedItems.map(item => item.name).join(', ');
      console.log('[App] Building detailed itinerary for:', itemNames);
      
      // Prepare items for the detailed itinerary builder
      const itemsForApi = savedItems.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        description: item.description,
        address: item.address,
        price: item.price || item.priceRange,
        coordinates: item.coordinates,
        lat: item.coordinates?.lat,
        lng: item.coordinates?.lng
      }));
      
      const response = await buildDetailedItinerary({
        items: itemsForApi,
        userLocation: {
          lat: userLocation.lat,
          lng: userLocation.lng,
          address: userLocation.address
        }
      });
      
      if (response.success && response.itinerary) {
        // Store the detailed itinerary
        setDetailedItinerary(response.itinerary);
        
        // Update budget
        setBudget(response.budget);
        
        // Set route data for map from detailed itinerary stops
        // Map expects "points" array with {lat, lng, name, type} format
        const routePoints = [
          // Start with user location
          { lat: userLocation.lat, lng: userLocation.lng, name: 'Start', type: 'start' },
          // Then all the itinerary stops
          ...response.itinerary.stops
            .filter(stop => stop.coordinates)
            .map(stop => ({
              lat: stop.coordinates!.lat,
              lng: stop.coordinates!.lng,
              name: stop.name,
              type: stop.type
            }))
        ];
        
        console.log('[App] Setting itinerary route with', routePoints.length, 'points');
        
        if (routePoints.length >= 2) {
          setItineraryRouteData({
            points: routePoints
          });
        }
        
        // Clear saved items since they're now in the itinerary
        setSavedItems([]);
        
        console.log('[App] Detailed itinerary built:', response.itinerary.title);
      }
    } catch (error) {
      console.error('[App] Failed to build itinerary:', error);
    } finally {
      setIsBuildingItinerary(false);
    }
  }, [savedItems, userLocation]);

  // Final itinerary generation handler
  const generateItinerary = useCallback(async () => {
    if (!searchResults || searchResults.features.length === 0) return;

    // For now, we use the original query from metadata to generate the plan
    // In a future version, we could pass the specific selected IDs
    const query = searchResults.metadata.query;
    console.log('[App] Generating smart plan for query:', query);
    setIsSearching(true);

    try {
      const response = await getSmartPlan({
        query,
        userLocation: { lat: userLocation.lat, lng: userLocation.lng }
      });
      console.log('[App] Smart plan generated:', response);

      setPlans(response.plans);
      if (response.parsedBudget) setTotalBudgetAmount(response.parsedBudget);
      setBudget(response.plans[activePlan].budget);

      // Build route as before
      const currentPlan = response.plans[activePlan];
      const routePoints: Array<{ lat: number; lng: number; name: string; type: string }> = [];
      routePoints.push({ lat: userLocation.lat, lng: userLocation.lng, name: 'Your Location', type: 'start' });

      for (const item of currentPlan.items) {
        if (item.coordinates && item.coordinates.lat && item.coordinates.lng) {
          routePoints.push({ lat: item.coordinates.lat, lng: item.coordinates.lng, name: item.name, type: item.type });
        }
      }

      if (routePoints.length > 1) {
        setItineraryRouteData({ points: routePoints, timestamp: Date.now() });
      }

      // Optionally clear search results once plan is active
      // setSearchResults(null);
    } catch (error) {
      console.error('[App] Plan generation failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [searchResults, userLocation, activePlan]);

  // Handle plan switching
  const handlePlanChange = useCallback((plan: 'A' | 'B') => {
    setActivePlan(plan);
    if (plans) {
      setBudget(plans[plan].budget);

      // Update route for new plan
      const routePoints: Array<{ lat: number; lng: number; name: string; type: string }> = [];
      routePoints.push({
        lat: userLocation.lat,
        lng: userLocation.lng,
        name: 'Your Location',
        type: 'start'
      });

      for (const item of plans[plan].items) {
        if (item.coordinates && item.coordinates.lat && item.coordinates.lng) {
          routePoints.push({
            lat: item.coordinates.lat,
            lng: item.coordinates.lng,
            name: item.name,
            type: item.type
          });
        }
      }

      if (routePoints.length > 1) {
        setItineraryRouteData({
          points: routePoints,
          timestamp: Date.now()
        });
      }
    }
  }, [plans, userLocation]);

  const handleVoiceClick = useCallback(() => {
    console.log('[App] Voice button clicked');
    setVoiceOnboardingActive(true);
  }, []);

  const handleItemClick = useCallback((item: ItineraryItem) => {
    console.log('[App] Item clicked:', item);
  }, []);

  // State for real route duration and segments
  const [routeInfo, setRouteInfo] = useState<{
    totalDuration: number;
    segments: Array<{ mode: string; duration: number }>;
    walkToStation?: number;
    subwayDuration?: number;
    walkFromStation?: number;
  } | null>(null);

  // Callback when route is calculated
  const handleRouteCalculated = useCallback((info: { totalDuration: number; segments: Array<{ mode: string; duration: number }> }) => {
    console.log('[App] Route calculated - received:', info);

    // Parse segments to get walking and transit times
    let walkToStation = 0;
    let subwayDuration = 0;
    let walkFromStation = 0;

    info.segments.forEach((seg, idx) => {
      console.log(`[App] Segment ${idx}: mode=${seg.mode}, duration=${seg.duration} min`);
      if (seg.mode === 'walking') {
        if (idx === 0) {
          walkToStation = seg.duration;
        } else {
          walkFromStation = seg.duration;
        }
      } else if (seg.mode === 'transit') {
        subwayDuration = seg.duration;
      }
    });

    const routeData = {
      ...info,
      walkToStation,
      subwayDuration,
      walkFromStation
    };

    console.log('[App] Setting routeInfo:', routeData);
    setRouteInfo(routeData);
  }, []);

  // Get items from active plan
  const overlayItems: ItineraryItem[] = plans ? plans[activePlan].items : [];

  const totalSpent = budget.food + budget.activity + budget.transit;

  if (showWelcome) {
    return <WelcomeScreen onStart={handleDisplayStart} />;
  }

  return (
    <>
      {/* Map Background */}
      <MapErrorBoundary>
        <Map3D
          settings={settings}
          selectedLocation={selectedLocation}
          mapCommand={mapCommand}
          itineraryRouteData={itineraryRouteData}
          searchResults={searchResults}
          onRouteCalculated={handleRouteCalculated}
          activeLayer={activeLayer}
          onActiveLayerChange={setActiveLayer}
          onAddToItinerary={handleAddToItinerary}
          savedItemIds={savedItems.map(i => i.id)}
        />
      </MapErrorBoundary>

      {/* Right Panel & Bottom Search - Map specific UI */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <RightItineraryPanel
          items={overlayItems}
          budget={budget}
          totalBudget={totalBudgetAmount}
          onItemClick={handleItemClick}
          activePlan={activePlan}
          onPlanChange={handlePlanChange}
          isLoading={isSearching || isBuildingItinerary}
          routeInfo={routeInfo}
          savedItems={savedItems}
          onRemoveSavedItem={handleRemoveFromItinerary}
          onClearSavedItems={handleClearSavedItems}
          onBuildItinerary={handleBuildItinerary}
          detailedItinerary={detailedItinerary}
          onClearDetailedItinerary={() => {
            setDetailedItinerary(null);
            setItineraryRouteData(null);
          }}
        />
        <BottomSearchBar
          onSearch={handleSearch}
          onVoiceClick={handleVoiceClick}
          activeLayer={activeLayer}
        />

        {/* Create Plan Button Overlay - Only visible when search results exist but no plan yet */}
        {searchResults && !plans && !isSearching && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto">
            <button
              onClick={generateItinerary}
              className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold py-4 px-10 rounded-full shadow-[0_8px_32px_rgba(249,115,22,0.4)] flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95 border border-white/20 backdrop-blur-md group"
            >
              <i className="fa-solid fa-wand-magic-sparkles group-hover:rotate-12 transition-transform"></i>
              <span>Create Smart Itinerary</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function App() {
  const [isLoading, setIsLoading] = useState(true);

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <>
      {isLoading && (
        <LoadingScreen onLoadingComplete={handleLoadingComplete} duration={1500} />
      )}
      <Routes>
        <Route path="/" element={<Navigate to="/map" replace />} />
        <Route element={<MainLayout />}>
          <Route path="/map" element={<MapPage />} />
          <Route path="/journey" element={<JourneyPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
