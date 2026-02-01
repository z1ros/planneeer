const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

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
    source_url: "https://www.giants.com",
    id: "football_event_001",
    createdAt: new Date()
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
    source_url: "https://www.newyorkjets.com",
    id: "football_event_002",
    createdAt: new Date()
  },
  {
    title: "Super Bowl Watch Party - Times Square",
    description: "Join thousands of fans for the ultimate Super Bowl viewing experience in the heart of Times Square with giant screens and live entertainment.",
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
    source_url: "https://www.timessquarenyc.org",
    id: "football_event_003",
    createdAt: new Date()
  },
  {
    title: "College Football: Columbia Lions vs Cornell Big Red",
    description: "Ivy League football action as the Columbia Lions face off against the Cornell Big Red at Wien Stadium.",
    start_time: "2026-02-22T14:00:00-05:00",
    end_time: "2026-02-22T17:00:00-05:00",
    venue: {
      name: "Wien Stadium at Baker Athletics Complex",
      address: "533 W 218th St, New York, NY 10034",
      lat: 40.8700,
      lng: -73.9200
    },
    categories: ["football", "sports", "college football", "ivy league"],
    price: "$15-$40",
    source: "Columbia Athletics",
    source_url: "https://gocolumbialions.com",
    id: "football_event_004",
    createdAt: new Date()
  },
  {
    title: "Flag Football Tournament - Central Park",
    description: "Annual flag football tournament in Central Park. Teams of all skill levels welcome. Great for families and friends!",
    start_time: "2026-02-14T10:00:00-05:00",
    end_time: "2026-02-14T17:00:00-05:00",
    venue: {
      name: "Central Park Great Lawn",
      address: "Central Park, New York, NY",
      lat: 40.7812,
      lng: -73.9665
    },
    categories: ["football", "sports", "flag football", "tournament", "family friendly"],
    price: "$25 per team",
    source: "NYC Parks",
    source_url: "https://www.nycgovparks.org",
    id: "football_event_005",
    createdAt: new Date()
  },
  {
    title: "NFL Draft Watch Party - Brooklyn",
    description: "Watch the NFL Draft live with fellow football fans. Food, drinks, and prizes for best draft predictions!",
    start_time: "2026-04-23T20:00:00-04:00",
    end_time: "2026-04-24T00:00:00-04:00",
    venue: {
      name: "Brooklyn Steel",
      address: "319 Frost St, Brooklyn, NY 11222",
      lat: 40.7166,
      lng: -73.9500
    },
    categories: ["football", "sports", "nfl", "draft", "watch party"],
    price: "$20",
    source: "Brooklyn Events",
    source_url: "https://www.bowerypresents.com/brooklyn-steel",
    id: "football_event_006",
    createdAt: new Date()
  },
  {
    title: "Youth Football Clinic with NFL Players",
    description: "Kids ages 8-14 can learn football skills from current and former NFL players. Equipment provided.",
    start_time: "2026-02-21T09:00:00-05:00",
    end_time: "2026-02-21T12:00:00-05:00",
    venue: {
      name: "Icahn Stadium",
      address: "20 Randalls Island Park, New York, NY 10035",
      lat: 40.7935,
      lng: -73.9215
    },
    categories: ["football", "sports", "youth", "clinic", "nfl"],
    price: "Free",
    source: "NFL Play 60",
    source_url: "https://www.nfl.com/play60",
    id: "football_event_007",
    createdAt: new Date()
  },
  {
    title: "Monday Night Football Watch Party - Sports Bar",
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
    source_url: "https://www.theainsworth.com",
    id: "football_event_008",
    createdAt: new Date()
  }
];

async function addFootballEvents() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('nyc');
    const collection = db.collection('events_v2');

    // Insert the football events
    const result = await collection.insertMany(footballEvents);

    console.log(`✅ Successfully added ${result.insertedCount} football events!`);
    console.log('\nAdded events:');
    footballEvents.forEach(e => console.log(` - ${e.title}`));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

addFootballEvents();
