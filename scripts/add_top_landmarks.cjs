const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function getEmbedding(text) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] }
        })
      }
    );
    const data = await response.json();
    return data.embedding?.values || null;
  } catch (error) {
    console.error('Embedding error:', error.message);
    return null;
  }
}

// Top 30 NYC Landmarks with proper MongoDB format
const topLandmarks = [
  {
    name: "Empire State Building",
    category: "Observation Deck",
    location: { type: "Point", coordinates: [-73.9857, 40.7484], borough: "Manhattan", neighborhood: "Midtown" },
    vibe_metadata: {
      description: "Iconic 102-story Art Deco skyscraper with observation decks on 86th and 102nd floors offering stunning city views. A must-visit NYC landmark since 1931.",
      tags: ["observation deck", "skyline", "iconic", "art deco", "views"],
      best_time_to_visit: "Sunset for amazing views",
      pro_tip: "Go at night for fewer crowds and sparkling city lights"
    },
    id: "landmark_001"
  },
  {
    name: "One World Trade Center",
    category: "Observation Deck",
    location: { type: "Point", coordinates: [-74.0134, 40.7127], borough: "Manhattan", neighborhood: "Financial District" },
    vibe_metadata: {
      description: "Tallest building in the Western Hemisphere at 1,776 feet. One World Observatory offers breathtaking 360-degree views of NYC from floors 100-102.",
      tags: ["observation deck", "skyline", "memorial", "modern", "freedom tower"],
      best_time_to_visit: "Clear days for best visibility",
      pro_tip: "Book tickets online in advance to skip the lines"
    },
    id: "landmark_002"
  },
  {
    name: "Statue of Liberty",
    category: "Monument",
    location: { type: "Point", coordinates: [-74.0445, 40.6892], borough: "Liberty Island", neighborhood: "New York Harbor" },
    vibe_metadata: {
      description: "Iconic copper statue gifted by France in 1886, symbol of freedom and democracy. Take the ferry from Battery Park for an unforgettable experience.",
      tags: ["statue", "monument", "historic", "iconic", "ferry", "freedom"],
      best_time_to_visit: "Early morning to beat crowds",
      pro_tip: "Reserve crown tickets months in advance - they sell out fast!"
    },
    id: "landmark_003"
  },
  {
    name: "Central Park",
    category: "Park",
    location: { type: "Point", coordinates: [-73.9654, 40.7829], borough: "Manhattan", neighborhood: "Upper Manhattan" },
    vibe_metadata: {
      description: "843-acre urban oasis in the heart of Manhattan with lakes, gardens, Bethesda Fountain, Bow Bridge, and countless walking paths. NYC's backyard since 1858.",
      tags: ["park", "nature", "walking", "free", "outdoor", "romantic"],
      best_time_to_visit: "Spring for cherry blossoms, Fall for foliage",
      pro_tip: "Rent a rowboat at the Loeb Boathouse for a romantic experience"
    },
    id: "landmark_004"
  },
  {
    name: "Times Square",
    category: "Plaza",
    location: { type: "Point", coordinates: [-73.9855, 40.7580], borough: "Manhattan", neighborhood: "Theater District" },
    vibe_metadata: {
      description: "The Crossroads of the World - dazzling neon lights, Broadway theaters, street performers, and bustling crowds 24/7. Experience the energy of NYC!",
      tags: ["lights", "broadway", "entertainment", "nightlife", "iconic", "free"],
      best_time_to_visit: "Night time for the full light show",
      pro_tip: "Grab TKTS discount Broadway tickets at the red steps"
    },
    id: "landmark_005"
  },
  {
    name: "Brooklyn Bridge",
    category: "Bridge",
    location: { type: "Point", coordinates: [-73.9969, 40.7061], borough: "Brooklyn/Manhattan", neighborhood: "DUMBO" },
    vibe_metadata: {
      description: "Historic 1883 suspension bridge connecting Manhattan and Brooklyn. Walk or bike across for amazing views of the skyline and harbor. A NYC icon!",
      tags: ["bridge", "historic", "walking", "views", "free", "photography"],
      best_time_to_visit: "Sunrise or sunset for best photos",
      pro_tip: "Walk from Brooklyn to Manhattan for the best skyline views"
    },
    id: "landmark_006"
  },
  {
    name: "9/11 Memorial & Museum",
    category: "Memorial",
    location: { type: "Point", coordinates: [-74.0134, 40.7115], borough: "Manhattan", neighborhood: "Financial District" },
    vibe_metadata: {
      description: "Moving tribute to the victims of September 11, 2001 with twin reflecting pools and underground museum. A powerful and emotional experience.",
      tags: ["memorial", "museum", "historic", "somber", "moving", "tribute"],
      best_time_to_visit: "Weekday mornings for quieter reflection",
      pro_tip: "The memorial pools are free, museum requires tickets"
    },
    id: "landmark_007"
  },
  {
    name: "The High Line",
    category: "Park",
    location: { type: "Point", coordinates: [-74.0048, 40.7480], borough: "Manhattan", neighborhood: "Chelsea" },
    vibe_metadata: {
      description: "Elevated linear park built on former freight rail lines, featuring gardens, art installations, and unique city views. A creative urban renewal success!",
      tags: ["park", "elevated", "art", "walking", "free", "gardens"],
      best_time_to_visit: "Spring and summer for blooming gardens",
      pro_tip: "Start at the Gansevoort Street entrance and walk north"
    },
    id: "landmark_008"
  },
  {
    name: "Rockefeller Center",
    category: "Complex",
    location: { type: "Point", coordinates: [-73.9787, 40.7587], borough: "Manhattan", neighborhood: "Midtown" },
    vibe_metadata: {
      description: "Famous complex with Top of the Rock observation deck, NBC Studios, Radio City Music Hall, and the iconic Christmas tree location. Art Deco masterpiece!",
      tags: ["observation deck", "shopping", "christmas", "nbc", "skating", "art deco"],
      best_time_to_visit: "December for the Christmas tree",
      pro_tip: "Top of the Rock has better views of the Empire State than the Empire State has of itself!"
    },
    id: "landmark_009"
  },
  {
    name: "Metropolitan Museum of Art",
    category: "Museum",
    location: { type: "Point", coordinates: [-73.9632, 40.7794], borough: "Manhattan", neighborhood: "Upper East Side" },
    vibe_metadata: {
      description: "World's largest art museum with over 2 million works spanning 5,000 years of history. Egyptian Temple of Dendur, European masters, and more!",
      tags: ["museum", "art", "culture", "history", "world-class"],
      best_time_to_visit: "Weekday mornings",
      pro_tip: "The rooftop garden bar has amazing Central Park views in summer"
    },
    id: "landmark_010"
  },
  {
    name: "Grand Central Terminal",
    category: "Transit",
    location: { type: "Point", coordinates: [-73.9772, 40.7527], borough: "Manhattan", neighborhood: "Midtown East" },
    vibe_metadata: {
      description: "Stunning Beaux-Arts train station with celestial ceiling, famous clock, whispering gallery, and great dining. One of the world's most beautiful stations!",
      tags: ["transit", "architecture", "historic", "dining", "free"],
      best_time_to_visit: "Off-peak hours to admire the architecture",
      pro_tip: "Find the whispering gallery near the Oyster Bar - whisper to the wall!"
    },
    id: "landmark_011"
  },
  {
    name: "Madison Square Garden",
    category: "Arena",
    location: { type: "Point", coordinates: [-73.9934, 40.7505], borough: "Manhattan", neighborhood: "Chelsea" },
    vibe_metadata: {
      description: "World's most famous arena - home to the Knicks and Rangers, hosting legendary concerts and events. The energy inside is electric!",
      tags: ["sports", "concerts", "arena", "knicks", "entertainment", "basketball"],
      best_time_to_visit: "During a Knicks game or major concert",
      pro_tip: "Take the MSG All Access Tour to see behind the scenes"
    },
    id: "landmark_012"
  },
  {
    name: "Chrysler Building",
    category: "Skyscraper",
    location: { type: "Point", coordinates: [-73.9755, 40.7516], borough: "Manhattan", neighborhood: "Midtown East" },
    vibe_metadata: {
      description: "Art Deco masterpiece with iconic stainless steel crown and eagle gargoyles. Many consider it NYC's most beautiful skyscraper. Lobby open to public!",
      tags: ["architecture", "art deco", "skyscraper", "iconic", "historic"],
      best_time_to_visit: "Daytime to see the lobby",
      pro_tip: "The lobby has stunning Art Deco details - don't miss it!"
    },
    id: "landmark_013"
  },
  {
    name: "American Museum of Natural History",
    category: "Museum",
    location: { type: "Point", coordinates: [-73.9740, 40.7813], borough: "Manhattan", neighborhood: "Upper West Side" },
    vibe_metadata: {
      description: "Massive museum with dinosaur fossils, Rose Center planetarium, and the famous blue whale. Perfect for families and anyone curious about our world!",
      tags: ["museum", "dinosaurs", "science", "planetarium", "family"],
      best_time_to_visit: "Weekday mornings",
      pro_tip: "The dinosaur halls on the 4th floor are the highlight"
    },
    id: "landmark_014"
  },
  {
    name: "DUMBO",
    category: "Neighborhood",
    location: { type: "Point", coordinates: [-73.9894, 40.7033], borough: "Brooklyn", neighborhood: "DUMBO" },
    vibe_metadata: {
      description: "Trendy Brooklyn neighborhood with cobblestone streets, art galleries, and the most iconic Manhattan Bridge view. Perfect for photography!",
      tags: ["neighborhood", "views", "art", "photography", "trendy", "instagram"],
      best_time_to_visit: "Golden hour for photos",
      pro_tip: "Washington Street has the famous bridge-framed Empire State shot"
    },
    id: "landmark_015"
  },
  {
    name: "Wall Street",
    category: "Financial District",
    location: { type: "Point", coordinates: [-74.0110, 40.7069], borough: "Manhattan", neighborhood: "Financial District" },
    vibe_metadata: {
      description: "Heart of American finance. See the famous Charging Bull statue, Federal Hall where Washington was inaugurated, and the New York Stock Exchange.",
      tags: ["finance", "historic", "bull", "business", "iconic", "free"],
      best_time_to_visit: "Weekday mornings for the energy",
      pro_tip: "The Fearless Girl statue faces the bull - great photo op!"
    },
    id: "landmark_016"
  },
  {
    name: "St. Patrick's Cathedral",
    category: "Church",
    location: { type: "Point", coordinates: [-73.9762, 40.7585], borough: "Manhattan", neighborhood: "Midtown" },
    vibe_metadata: {
      description: "Stunning Gothic Revival cathedral on 5th Avenue, a peaceful oasis amid Midtown bustle. Beautiful stained glass and architecture.",
      tags: ["church", "architecture", "gothic", "peaceful", "free"],
      best_time_to_visit: "During a mass for the full experience",
      pro_tip: "Free to enter, donations appreciated"
    },
    id: "landmark_017"
  },
  {
    name: "Chelsea Market",
    category: "Market",
    location: { type: "Point", coordinates: [-74.0061, 40.7424], borough: "Manhattan", neighborhood: "Chelsea" },
    vibe_metadata: {
      description: "Food hall and shopping destination in former Nabisco factory. Amazing eats from around the world, unique shops, and great atmosphere!",
      tags: ["food", "market", "shopping", "indoor", "foodie"],
      best_time_to_visit: "Lunch time for the best food options",
      pro_tip: "Los Tacos No.1 has some of the best tacos in NYC"
    },
    id: "landmark_018"
  },
  {
    name: "Little Italy",
    category: "Neighborhood",
    location: { type: "Point", coordinates: [-73.9975, 40.7191], borough: "Manhattan", neighborhood: "Little Italy" },
    vibe_metadata: {
      description: "Historic Italian-American neighborhood with authentic restaurants, bakeries, and old-world charm. Try the cannoli and fresh pasta!",
      tags: ["italian", "food", "historic", "neighborhood", "culture"],
      best_time_to_visit: "San Gennaro Festival in September",
      pro_tip: "Ferrara Bakery has been serving cannoli since 1892"
    },
    id: "landmark_019"
  },
  {
    name: "Chinatown",
    category: "Neighborhood",
    location: { type: "Point", coordinates: [-73.9974, 40.7158], borough: "Manhattan", neighborhood: "Chinatown" },
    vibe_metadata: {
      description: "Vibrant neighborhood with authentic Chinese restaurants, shops, and cultural experiences. The largest Chinatown in the Western Hemisphere!",
      tags: ["chinese", "food", "culture", "shopping", "authentic"],
      best_time_to_visit: "Lunar New Year for celebrations",
      pro_tip: "Dim sum at Nom Wah Tea Parlor - NYC's oldest dim sum spot"
    },
    id: "landmark_020"
  },
  {
    name: "Washington Square Park",
    category: "Park",
    location: { type: "Point", coordinates: [-73.9973, 40.7308], borough: "Manhattan", neighborhood: "Greenwich Village" },
    vibe_metadata: {
      description: "Iconic Greenwich Village park with famous arch, fountain, and vibrant street performers. The heart of NYU and bohemian NYC culture!",
      tags: ["park", "arch", "nyu", "performers", "free", "village"],
      best_time_to_visit: "Weekend afternoons for street performers",
      pro_tip: "Watch the chess hustlers play - they're legendary!"
    },
    id: "landmark_021"
  },
  {
    name: "Vessel at Hudson Yards",
    category: "Structure",
    location: { type: "Point", coordinates: [-74.0012, 40.7536], borough: "Manhattan", neighborhood: "Hudson Yards" },
    vibe_metadata: {
      description: "Striking honeycomb-shaped structure with 154 interconnecting flights of stairs. A unique architectural experience and Instagram hotspot!",
      tags: ["modern", "architecture", "views", "instagram", "unique"],
      best_time_to_visit: "Golden hour for photos",
      pro_tip: "Free timed tickets required - book online"
    },
    id: "landmark_022"
  },
  {
    name: "Edge at Hudson Yards",
    category: "Observation Deck",
    location: { type: "Point", coordinates: [-74.0007, 40.7541], borough: "Manhattan", neighborhood: "Hudson Yards" },
    vibe_metadata: {
      description: "Highest outdoor sky deck in Western Hemisphere with glass floor and thrilling views. Not for the faint of heart but unforgettable!",
      tags: ["observation deck", "views", "glass floor", "thrilling", "modern"],
      best_time_to_visit: "Sunset for golden hour views",
      pro_tip: "Try City Climb if you want an extreme experience"
    },
    id: "landmark_023"
  },
  {
    name: "Flatiron Building",
    category: "Skyscraper",
    location: { type: "Point", coordinates: [-73.9897, 40.7411], borough: "Manhattan", neighborhood: "Flatiron District" },
    vibe_metadata: {
      description: "Iconic triangular building from 1902, one of NYC's most photographed landmarks. The building that gave the neighborhood its name!",
      tags: ["architecture", "historic", "triangular", "iconic", "photography"],
      best_time_to_visit: "Anytime - best from the north plaza",
      pro_tip: "Madison Square Park across the street is perfect for photos"
    },
    id: "landmark_024"
  },
  {
    name: "MoMA - Museum of Modern Art",
    category: "Museum",
    location: { type: "Point", coordinates: [-73.9776, 40.7614], borough: "Manhattan", neighborhood: "Midtown" },
    vibe_metadata: {
      description: "World-renowned modern art museum with Van Gogh's Starry Night, Picasso, Warhol, and cutting-edge contemporary works. Art lover's paradise!",
      tags: ["museum", "art", "modern", "picasso", "culture", "van gogh"],
      best_time_to_visit: "Friday evenings (free 5:30-9pm)",
      pro_tip: "Free Friday nights courtesy of UNIQLO!"
    },
    id: "landmark_025"
  },
  {
    name: "Bryant Park",
    category: "Park",
    location: { type: "Point", coordinates: [-73.9832, 40.7536], borough: "Manhattan", neighborhood: "Midtown" },
    vibe_metadata: {
      description: "Midtown oasis behind the library with seasonal activities, free events, and great people watching. Ice skating in winter, movies in summer!",
      tags: ["park", "free", "events", "relaxing", "midtown"],
      best_time_to_visit: "Summer for outdoor movies",
      pro_tip: "Free ice skating in winter - just pay for skate rental"
    },
    id: "landmark_026"
  },
  {
    name: "New York Public Library",
    category: "Library",
    location: { type: "Point", coordinates: [-73.9822, 40.7532], borough: "Manhattan", neighborhood: "Midtown" },
    vibe_metadata: {
      description: "Stunning Beaux-Arts library with famous lion statues Patience and Fortitude, and the breathtaking Rose Main Reading Room. Free to visit!",
      tags: ["library", "architecture", "free", "historic", "lions"],
      best_time_to_visit: "Weekday afternoons",
      pro_tip: "The Rose Reading Room ceiling is a must-see!"
    },
    id: "landmark_027"
  },
  {
    name: "Ellis Island",
    category: "Museum",
    location: { type: "Point", coordinates: [-74.0396, 40.6995], borough: "Liberty Island", neighborhood: "New York Harbor" },
    vibe_metadata: {
      description: "Historic immigration station where 12 million immigrants entered America. Powerful museum experience and ancestry database available.",
      tags: ["museum", "immigration", "historic", "ferry", "moving"],
      best_time_to_visit: "Early morning ferry",
      pro_tip: "Search the immigration records for your family history!"
    },
    id: "landmark_028"
  },
  {
    name: "Coney Island",
    category: "Amusement",
    location: { type: "Point", coordinates: [-73.9790, 40.5749], borough: "Brooklyn", neighborhood: "Coney Island" },
    vibe_metadata: {
      description: "Classic beachside amusement area with boardwalk, Luna Park rides, Nathan's Famous hot dogs, and summer vibes. NYC's beach escape!",
      tags: ["beach", "amusement", "boardwalk", "summer", "rides", "hot dogs"],
      best_time_to_visit: "Summer weekends",
      pro_tip: "Try a hot dog at Nathan's - hot dog eating contest site!"
    },
    id: "landmark_029"
  },
  {
    name: "Brooklyn Botanic Garden",
    category: "Garden",
    location: { type: "Point", coordinates: [-73.9654, 40.6694], borough: "Brooklyn", neighborhood: "Prospect Heights" },
    vibe_metadata: {
      description: "52-acre garden with Japanese Hill-and-Pond Garden, cherry blossoms in spring, and peaceful escapes from the city. A Brooklyn gem!",
      tags: ["garden", "nature", "cherry blossoms", "peaceful", "beautiful"],
      best_time_to_visit: "Late April for cherry blossoms",
      pro_tip: "The Japanese Garden is the most beautiful section"
    },
    id: "landmark_030"
  }
];

async function addTopLandmarks() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db('nyc');
    const landmarks = db.collection('landmarks');

    console.log('=== ADDING TOP NYC LANDMARKS ===\n');

    let added = 0;
    let skipped = 0;

    for (const landmark of topLandmarks) {
      // Check if exists
      const exists = await landmarks.findOne({
        $or: [
          { id: landmark.id },
          { name: landmark.name }
        ]
      });

      if (exists) {
        console.log(`⏭️  Skipping (exists): ${landmark.name}`);
        skipped++;
        continue;
      }

      // Generate embedding
      const textForEmbedding = `${landmark.name} ${landmark.vibe_metadata.description} ${landmark.category} ${landmark.vibe_metadata.tags.join(' ')}`;
      console.log(`🔄 Adding: ${landmark.name}`);

      const embedding = await getEmbedding(textForEmbedding);

      const doc = {
        ...landmark,
        embedding,
        createdAt: new Date()
      };

      await landmarks.insertOne(doc);
      console.log(`✅ Added: ${landmark.name}`);
      added++;

      // Rate limiting
      await new Promise(r => setTimeout(r, 150));
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Added: ${added}`);
    console.log(`Skipped: ${skipped}`);

    const totalLandmarks = await landmarks.countDocuments();
    const withCoords = await landmarks.countDocuments({ 'location.coordinates': { $exists: true } });
    const withEmbeddings = await landmarks.countDocuments({ embedding: { $exists: true } });

    console.log(`\nTotal landmarks: ${totalLandmarks}`);
    console.log(`With coordinates: ${withCoords}`);
    console.log(`With embeddings: ${withEmbeddings}`);
    console.log('\n✅ Done! Top landmarks added with full descriptions.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

addTopLandmarks();
