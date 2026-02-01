const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Football events to add (with coordinates)
const footballEvents = [
  {
    title: "NFL: New York Giants vs Philadelphia Eagles",
    description: "Watch the New York Giants take on the Philadelphia Eagles in this exciting NFC East rivalry game at MetLife Stadium.",
    start_time: "2026-02-08T13:00:00-05:00",
    end_time: "2026-02-08T16:30:00-05:00",
    venue: {
      name: "MetLife Stadium",
      address: "1 MetLife Stadium Dr, East Rutherford, NJ 07073",
      lat: 40.8128,
      lng: -74.0742
    },
    categories: ["football", "sports", "nfl", "giants"],
    price: "$85-$500",
    source: "NFL",
    id: "football_001"
  },
  {
    title: "NFL: New York Jets vs New England Patriots",
    description: "The New York Jets host the New England Patriots in a classic AFC East showdown at MetLife Stadium.",
    start_time: "2026-02-15T16:25:00-05:00",
    end_time: "2026-02-15T19:30:00-05:00",
    venue: {
      name: "MetLife Stadium",
      address: "1 MetLife Stadium Dr, East Rutherford, NJ 07073",
      lat: 40.8128,
      lng: -74.0742
    },
    categories: ["football", "sports", "nfl", "jets"],
    price: "$75-$450",
    source: "NFL",
    id: "football_002"
  },
  {
    title: "Super Bowl Watch Party - Times Square",
    description: "Join thousands of fans for the ultimate Super Bowl viewing experience in Times Square with giant screens.",
    start_time: "2026-02-08T18:00:00-05:00",
    end_time: "2026-02-08T23:00:00-05:00",
    venue: {
      name: "Times Square",
      address: "Times Square, Manhattan, NY",
      lat: 40.7580,
      lng: -73.9855
    },
    categories: ["football", "sports", "nfl", "super bowl", "watch party"],
    price: "Free",
    source: "NYC Events",
    id: "football_003"
  },
  {
    title: "Monday Night Football Watch Party",
    description: "Weekly Monday Night Football viewing at NYC's best sports bar. Drink specials and game-day appetizers.",
    start_time: "2026-02-09T20:00:00-05:00",
    end_time: "2026-02-09T23:30:00-05:00",
    venue: {
      name: "The Ainsworth",
      address: "122 W 26th St, New York, NY 10001",
      lat: 40.7448,
      lng: -73.9917
    },
    categories: ["football", "sports", "nfl", "monday night football", "bar"],
    price: "Free entry",
    source: "The Ainsworth",
    id: "football_004"
  }
];

// Soccer venue coordinates mapping
const soccerVenueCoords = {
  "Bushwick Inlet": { lat: 40.7214, lng: -73.9614 },
  "Williamsburg": { lat: 40.7081, lng: -73.9571 },
  "Astoria Park": { lat: 40.7785, lng: -73.9230 },
  "Pier 40": { lat: 40.7275, lng: -74.0114 },
  "Manhattan": { lat: 40.7580, lng: -73.9855 }
};

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

    if (!response.ok) {
      console.error('Embedding API error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.embedding?.values || null;
  } catch (error) {
    console.error('Embedding error:', error.message);
    return null;
  }
}

async function fixSportsEvents() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db('nyc');
    const eventsV2 = db.collection('events_v2');

    // === STEP 1: Add Football Events ===
    console.log('=== ADDING FOOTBALL EVENTS ===');
    
    for (const event of footballEvents) {
      // Check if already exists
      const exists = await eventsV2.findOne({ 
        $or: [
          { id: event.id },
          { title: event.title }
        ]
      });

      if (exists) {
        console.log(`⏭️  Skipping (exists): ${event.title}`);
        continue;
      }

      // Generate embedding
      const textForEmbedding = `${event.title} ${event.description} ${event.categories.join(' ')} ${event.venue.name}`;
      console.log(`🔄 Generating embedding for: ${event.title}`);
      
      const embedding = await getEmbedding(textForEmbedding);
      
      const eventDoc = {
        ...event,
        embedding,
        createdAt: new Date()
      };

      await eventsV2.insertOne(eventDoc);
      console.log(`✅ Added: ${event.title} [${embedding ? 'vectorized' : 'no embedding'}]`);
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    // === STEP 2: Fix Soccer Events Coordinates ===
    console.log('\n=== FIXING SOCCER EVENT COORDINATES ===');

    const soccerEvents = await eventsV2.find({
      $or: [
        { title: { $regex: /soccer/i } },
        { description: { $regex: /soccer/i } },
        { categories: { $regex: /soccer/i } }
      ]
    }).toArray();

    console.log(`Found ${soccerEvents.length} soccer events to fix`);

    for (const event of soccerEvents) {
      const title = event.title || event.name || '';
      
      // Skip if already has coordinates
      if (event.venue?.lat || event.location?.coordinates) {
        console.log(`⏭️  Already has coords: ${title}`);
        continue;
      }

      // Find matching venue
      let coords = null;
      for (const [venueName, venueCoords] of Object.entries(soccerVenueCoords)) {
        if (title.toLowerCase().includes(venueName.toLowerCase())) {
          coords = venueCoords;
          break;
        }
      }

      if (coords) {
        // Update with venue coordinates
        await eventsV2.updateOne(
          { _id: event._id },
          { 
            $set: { 
              venue: {
                name: title.split(' In ')[1] || 'NYC Soccer Field',
                lat: coords.lat,
                lng: coords.lng
              }
            }
          }
        );
        console.log(`✅ Fixed coords: ${title}`);
      } else {
        // Default to Central Park coordinates
        await eventsV2.updateOne(
          { _id: event._id },
          { 
            $set: { 
              venue: {
                name: 'NYC',
                lat: 40.7829,
                lng: -73.9654
              }
            }
          }
        );
        console.log(`✅ Added default coords: ${title}`);
      }
    }

    // === STEP 3: Summary ===
    console.log('\n=== FINAL SUMMARY ===');
    
    const footballCount = await eventsV2.countDocuments({
      $or: [
        { title: { $regex: /football|nfl|giants|jets|super bowl/i } },
        { categories: { $regex: /football/i } }
      ]
    });

    const soccerCount = await eventsV2.countDocuments({
      title: { $regex: /soccer/i }
    });

    const totalWithCoords = await eventsV2.countDocuments({
      $or: [
        { 'venue.lat': { $exists: true } },
        { 'location.coordinates': { $exists: true } }
      ]
    });

    const totalWithEmbeddings = await eventsV2.countDocuments({
      embedding: { $exists: true }
    });

    const total = await eventsV2.countDocuments();

    console.log(`Football events: ${footballCount}`);
    console.log(`Soccer events:   ${soccerCount}`);
    console.log(`With coords:     ${totalWithCoords}/${total}`);
    console.log(`With embeddings: ${totalWithEmbeddings}/${total}`);
    console.log('\n✅ Done! Sports events should now appear in Events layer and vector search.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

fixSportsEvents();
