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

// Real NYC soccer events with coordinates
const soccerEvents = [
  {
    title: "MLS: NYCFC vs LA Galaxy",
    description: "New York City FC takes on LA Galaxy at Yankee Stadium in exciting MLS action.",
    start_time: "2026-02-14T19:30:00-05:00",
    end_time: "2026-02-14T22:00:00-05:00",
    venue: { name: "Yankee Stadium", lat: 40.8296, lng: -73.9262 },
    categories: ["soccer", "sports", "mls", "nycfc"],
    price: "$35-$150",
    source: "MLS",
    id: "soccer_001"
  },
  {
    title: "MLS: NY Red Bulls vs Inter Miami",
    description: "NY Red Bulls host Inter Miami at Red Bull Arena. See Messi in action!",
    start_time: "2026-02-21T15:00:00-05:00",
    end_time: "2026-02-21T17:30:00-05:00",
    venue: { name: "Red Bull Arena", lat: 40.7369, lng: -74.1503 },
    categories: ["soccer", "sports", "mls", "red bulls", "messi"],
    price: "$50-$300",
    source: "MLS",
    id: "soccer_002"
  },
  {
    title: "Pickup Soccer - Bushwick Inlet Park",
    description: "Weekly pickup soccer game in Williamsburg. All skill levels welcome! Bring cleats.",
    start_time: "2026-02-08T10:00:00-05:00",
    end_time: "2026-02-08T12:00:00-05:00",
    venue: { name: "Bushwick Inlet Park", lat: 40.7214, lng: -73.9614 },
    categories: ["soccer", "sports", "pickup", "free"],
    price: "Free",
    source: "NYC Parks",
    id: "soccer_003"
  },
  {
    title: "Pickup Soccer - Astoria Park",
    description: "Sunday morning pickup soccer in Queens. Friendly games, all ages.",
    start_time: "2026-02-09T09:00:00-05:00",
    end_time: "2026-02-09T11:00:00-05:00",
    venue: { name: "Astoria Park", lat: 40.7785, lng: -73.9230 },
    categories: ["soccer", "sports", "pickup", "free"],
    price: "Free",
    source: "NYC Parks",
    id: "soccer_004"
  },
  {
    title: "Pickup Soccer - Pier 40 Manhattan",
    description: "Competitive 11v11 pickup soccer at Pier 40. Bring water and shin guards.",
    start_time: "2026-02-15T14:00:00-05:00",
    end_time: "2026-02-15T16:00:00-05:00",
    venue: { name: "Pier 40", lat: 40.7275, lng: -74.0114 },
    categories: ["soccer", "sports", "pickup", "free"],
    price: "Free",
    source: "NYC Parks",
    id: "soccer_005"
  },
  {
    title: "Champions League Watch Party - Brooklyn",
    description: "Watch Champions League matches with fellow soccer fans. Big screens, great atmosphere!",
    start_time: "2026-02-11T15:00:00-05:00",
    end_time: "2026-02-11T18:00:00-05:00",
    venue: { name: "Black Forest Brooklyn", lat: 40.6892, lng: -73.9864 },
    categories: ["soccer", "sports", "watch party", "champions league"],
    price: "Free entry",
    source: "Brooklyn Events",
    id: "soccer_006"
  }
];

// Basketball events too
const basketballEvents = [
  {
    title: "NBA: Brooklyn Nets vs Boston Celtics",
    description: "Brooklyn Nets face the Boston Celtics at Barclays Center.",
    start_time: "2026-02-10T19:30:00-05:00",
    end_time: "2026-02-10T22:00:00-05:00",
    venue: { name: "Barclays Center", lat: 40.6826, lng: -73.9754 },
    categories: ["basketball", "sports", "nba", "nets"],
    price: "$60-$400",
    source: "NBA",
    id: "basketball_001"
  },
  {
    title: "NBA: New York Knicks vs LA Lakers",
    description: "The Knicks host the Lakers at Madison Square Garden. Classic matchup!",
    start_time: "2026-02-12T19:00:00-05:00",
    end_time: "2026-02-12T21:30:00-05:00",
    venue: { name: "Madison Square Garden", lat: 40.7505, lng: -73.9934 },
    categories: ["basketball", "sports", "nba", "knicks"],
    price: "$100-$800",
    source: "NBA",
    id: "basketball_002"
  },
  {
    title: "Pickup Basketball - Rucker Park",
    description: "Legendary pickup basketball at Rucker Park in Harlem. Watch or play!",
    start_time: "2026-02-08T14:00:00-05:00",
    end_time: "2026-02-08T18:00:00-05:00",
    venue: { name: "Rucker Park", lat: 40.8298, lng: -73.9365 },
    categories: ["basketball", "sports", "pickup", "free"],
    price: "Free",
    source: "NYC Parks",
    id: "basketball_003"
  }
];

async function fixSoccerEvents() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const db = client.db('nyc');
    const eventsV2 = db.collection('events_v2');

    // First, check existing soccer events
    console.log('=== CHECKING EXISTING SOCCER EVENTS ===');
    const existingSoccer = await eventsV2.find({
      $or: [
        { title: { $regex: /soccer/i } },
        { categories: { $regex: /soccer/i } },
        { name: { $regex: /soccer/i } }
      ]
    }).toArray();

    console.log(`Found ${existingSoccer.length} existing soccer events:`);
    existingSoccer.forEach(e => {
      const hasVenue = e.venue?.lat ? 'venue.lat' : (e.location?.coordinates ? 'location.coords' : 'NO COORDS');
      const hasDesc = e.description ? 'has desc' : 'NO DESC';
      console.log(`  - ${e.title || e.name} [${hasVenue}] [${hasDesc}]`);
    });

    // Fix existing soccer events - add coordinates AND descriptions if missing
    console.log('\n=== FIXING EXISTING EVENTS ===');
    for (const event of existingSoccer) {
      const updates = {};
      const title = event.title || event.name || '';
      
      // Fix coordinates if missing
      if (!event.venue?.lat && event.location?.coordinates) {
        const [lng, lat] = event.location.coordinates;
        updates.venue = { name: event.location?.venue || 'NYC Soccer Field', lat, lng };
      }
      
      // Add description if missing
      if (!event.description || event.description.trim() === '') {
        // Generate description based on title
        if (title.toLowerCase().includes('pickup')) {
          updates.description = `Join this pickup soccer game! All skill levels welcome. Bring your cleats and water. Great way to meet fellow soccer enthusiasts in NYC.`;
        } else if (title.toLowerCase().includes('co-ed')) {
          updates.description = `Co-ed pickup soccer game open to all skill levels. Fun, friendly atmosphere. Come play and make new friends while enjoying the beautiful game!`;
        } else {
          updates.description = `Soccer event in NYC. Come out and enjoy the beautiful game with fellow football fans!`;
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await eventsV2.updateOne({ _id: event._id }, { $set: updates });
        console.log(`  Fixed: ${title} - added ${Object.keys(updates).join(', ')}`);
      }
    }

    // Add new soccer events
    console.log('\n=== ADDING SOCCER EVENTS ===');
    for (const event of soccerEvents) {
      const exists = await eventsV2.findOne({ 
        $or: [{ id: event.id }, { title: event.title }]
      });

      if (exists) {
        console.log(`⏭️  Skipping (exists): ${event.title}`);
        continue;
      }

      const textForEmbedding = `${event.title} ${event.description} ${event.categories.join(' ')}`;
      console.log(`🔄 Adding: ${event.title}`);
      
      const embedding = await getEmbedding(textForEmbedding);
      await eventsV2.insertOne({ ...event, embedding, createdAt: new Date() });
      console.log(`✅ Added: ${event.title}`);
      
      await new Promise(r => setTimeout(r, 200));
    }

    // Add basketball events
    console.log('\n=== ADDING BASKETBALL EVENTS ===');
    for (const event of basketballEvents) {
      const exists = await eventsV2.findOne({ 
        $or: [{ id: event.id }, { title: event.title }]
      });

      if (exists) {
        console.log(`⏭️  Skipping (exists): ${event.title}`);
        continue;
      }

      const textForEmbedding = `${event.title} ${event.description} ${event.categories.join(' ')}`;
      console.log(`🔄 Adding: ${event.title}`);
      
      const embedding = await getEmbedding(textForEmbedding);
      await eventsV2.insertOne({ ...event, embedding, createdAt: new Date() });
      console.log(`✅ Added: ${event.title}`);
      
      await new Promise(r => setTimeout(r, 200));
    }

    // Final summary
    console.log('\n=== FINAL SUMMARY ===');
    const counts = {
      soccer: await eventsV2.countDocuments({ $or: [{ title: /soccer/i }, { categories: /soccer/i }] }),
      basketball: await eventsV2.countDocuments({ $or: [{ title: /basketball/i }, { categories: /basketball/i }] }),
      football: await eventsV2.countDocuments({ $or: [{ title: /football|nfl/i }, { categories: /football/i }] }),
      total: await eventsV2.countDocuments(),
      withCoords: await eventsV2.countDocuments({ 'venue.lat': { $exists: true } })
    };

    console.log(`Soccer events:     ${counts.soccer}`);
    console.log(`Basketball events: ${counts.basketball}`);
    console.log(`Football events:   ${counts.football}`);
    console.log(`Total events:      ${counts.total}`);
    console.log(`With coordinates:  ${counts.withCoords}`);
    console.log('\n✅ Done!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

fixSoccerEvents();
