# What's Up New York 🗽

Your AI-powered NYC adventure planner with real-time 3D visualization, voice-controlled navigation, and automated reservations.

![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Mapbox](https://img.shields.io/badge/Mapbox-GL_3D-green) ![Gemini](https://img.shields.io/badge/Google-Gemini-orange) ![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Voice-purple)

---

## ✨ Features

### 🗺️ 3D Interactive Map
- **Stunning 3D visualization** of New York City with Mapbox GL JS
- **Cyberpunk-inspired dark theme** with glowing building extrusions
- **Dynamic weather overlays** - Rain, snow, and fog effects
- **Time-of-day lighting** - Watch the city transform from dawn to dusk
- **Helicopter tour mode** - Automated cinematic city flyover
- **Multiple camera modes** - Free, street, drone, and cinematic views

### 🚇 Real-Time NYC Transit
- **Live MTA subway tracking** - All lines (1-7, A-G, J-Z, L, N-W, S)
- **Authentic route colors** - Real MTA line colors on the map
- **Service status indicators**:
  - 🔵 **Cyan/Blue** - Healthy service, running normally
  - 🟠 **Orange/Amber** - Minor delays (>5 min)
  - 🔴 **Red** - Severe disruptions, suspensions, or reroutes
  - ⚪ **Grey** - Offline or awaiting data
- **Station-to-station routing** with walk times and transfer info

### 🍽️ Restaurant Discovery
- **MongoDB Atlas with vector search** - Semantic AI-powered search
- **Rating-based markers** with color coding:
  - 🟢 Green (4.5+) | 🔵 Blue (4.0-4.5) | 🟠 Amber (3.5-4.0) | 🔴 Red (<3.5)
- **Cuisine filtering** - Indian, Italian, Mexican, Japanese, and more
- **Vibe-based search** - "cozy", "romantic", "hidden gems", "cheap eats"
- **Price range filtering** - $ to $$$$

### 🎭 Events & Happenings
- **Local NYC events** from curated sources
- **Category filtering** - Music, comedy, theater, sports, art exhibitions
- **Sports events** - Football, basketball, baseball, hockey
- **Venue information** with coordinates and timing

### 🏛️ Landmarks & Attractions
- **Famous NYC landmarks** - Brooklyn Bridge, Empire State, Statue of Liberty
- **Museums and cultural sites** - MoMA, Met, Guggenheim
- **Parks and outdoor spaces** - Central Park, High Line, Prospect Park
- **AI-powered discovery** - "hidden places", "tourist spots", "Instagram-worthy"

### 🧠 AI-Powered Planning
- **Google Gemini integration** for intelligent itinerary building
- **Natural language queries** - "I want Indian food, Brooklyn Bridge, and a football game"
- **Smart routing optimization** - Groups nearby locations, minimizes travel
- **Budget-aware planning** - Tracks food, activities, and transit costs
- **Detailed itineraries** with:
  - Arrival/departure times
  - Duration at each stop
  - Pro tips and recommendations
  - Subway directions with line info
  - Walking directions between stops

### 🎙️ Voice Control & AI Voice (ElevenLabs)
- **Push-to-talk voice input** - Click mic and speak naturally
- **ElevenLabs Bella voice** - Natural, conversational AI responses
- **Voice commands**:
  - "Book a reservation at Carbone for tomorrow at 7pm"
  - "How do I get to Columbia?"
  - "What hidden places do you recommend?"
  - "I want to visit Brooklyn Bridge, get sushi, and see a show"
- **Spoken itinerary summaries** - Bella reads your plan aloud

### 📅 Automated Reservations (Fetch.ai + Playwright)
- **Voice-triggered bookings** - Say "Book a reservation at..." and it auto-submits
- **AI-powered reservation agent** using Fetch.ai ASI:One
- **Browser automation** with Playwright for OpenTable/Resy
- **Natural language processing** - Understands dates, times, party size
- **Manual booking option** - Reserve button on itinerary items

### 📱 UI/UX
- **Split-screen dashboard** - 3D map with side panels
- **Left navigation sidebar** - Layer toggles, quick actions
- **Right itinerary panel** - Timeline view with expandable cards
- **Bottom search bar** - Voice + text input with layer-aware placeholders
- **Budget breakdown** - Visual spending tracker
- **Welcome onboarding** - Guided first-time experience
- **Loading screen** - Animated NYC-themed intro
- **Responsive design** - Works on desktop and tablet

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **3D Maps** | Mapbox GL JS |
| **Styling** | Tailwind CSS + Custom CSS |
| **Animations** | Framer Motion |
| **Backend** | Node.js + Express |
| **Database** | MongoDB Atlas (with Vector Search) |
| **AI/LLM** | Google Gemini 2.0 Flash |
| **Voice TTS** | ElevenLabs (Bella voice) |
| **Voice STT** | Web Speech API |
| **Reservations** | Fetch.ai ASI:One + Playwright |
| **Transit Data** | MTA GTFS Realtime API |

---

## 🚀 Quick Start

1. **Clone the repo:**
   ```bash
   git clone https://github.com/z1ros/planneeer.git
   cd planneeer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env` file:**
   ```env
   # Required
   MONGODB_URI=your_mongodb_connection_string
   GEMINI_API_KEY=your_gemini_api_key
   VITE_MAPBOX_TOKEN=your_mapbox_token
   VITE_GEMINI_API_KEY=your_gemini_api_key
   VITE_ELEVENLABS_API_KEY=your_elevenlabs_key
   
   # Optional - for reservations
   ASI_ONE_API_KEY=your_asi_one_key
   FETCHAI_API_KEY=your_fetchai_key
   ```

4. **Run the app:**
   ```bash
   # Terminal 1: Backend server
   npm run server
   
   # Terminal 2: Frontend dev server
   npm run dev
   ```

5. **Open in browser:** http://localhost:5173

---

## 🔑 API Keys

| Service | Purpose | Get it at |
|---------|---------|-----------|
| **Mapbox** | 3D map rendering | [mapbox.com](https://mapbox.com) |
| **Google Gemini** | AI planning & chat | [ai.google.dev](https://ai.google.dev) |
| **ElevenLabs** | AI voice (Bella) | [elevenlabs.io](https://elevenlabs.io) |
| **MongoDB Atlas** | Database + vector search | [mongodb.com](https://mongodb.com) |
| **Fetch.ai** | Reservation agent | [fetch.ai](https://fetch.ai) |

---

## 🎨 Color Reference

| Element | Color | Usage |
|---------|-------|-------|
| `#00f3ff` | Electric Cyan | Healthy transit, accent |
| `#ff3d00` | Deep Orange | Delays, warnings |
| `#f97316` | Bright Orange | Primary buttons, CTAs |
| `#10b981` | Emerald Green | Success, high ratings |
| `#3b82f6` | Blue | Good ratings, info |
| `#8b5cf6` | Purple | Events, special |
| `#ec4899` | Pink | Food, restaurants |
| `#ef4444` | Red | Landmarks, alerts |

---

## 👥 Contributors

- [@Z1ros](https://github.com/Z1ros)
- [@markhryt](https://github.com/markhryt)
- [@akhilm2223](https://github.com/akhilm2223)
- [@Joseg313](https://github.com/Joseg313)

---

## 📄 License

MIT

---

<div align="center">

**What's Up New York** — *Your AI-powered guide to the city that never sleeps* 🌃

</div>