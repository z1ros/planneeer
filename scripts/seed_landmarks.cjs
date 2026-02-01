
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required in .env');
    process.exit(1);
}

// Essential NYC Landmarks Data to Seed
const LANDMARKS = [
    {
        name: "Empire State Building",
        category: "Historic/Attraction",
        location: { type: "Point", coordinates: [-73.9857, 40.7484], borough: "Manhattan", neighborhood: "Midtown" },
        vibe_metadata: {
            description: "Iconic Art Deco skyscraper with observatory offering 360-degree views.",
            tags: ["iconic", "view", "architecture", "history"],
            best_time_to_visit: "Sunset for day-to-night views."
        }
    },
    {
        name: "Central Park",
        category: "Park/Nature",
        location: { type: "Point", coordinates: [-73.9665, 40.7829], borough: "Manhattan", neighborhood: "Upper East/West Side" },
        vibe_metadata: {
            description: "Massive urban park with zoo, lakes, and meadows.",
            tags: ["nature", "relaxing", "outdoor", "free"],
            best_time_to_visit: "Early morning or weekends."
        }
    },
    {
        name: "Statue of Liberty",
        category: "Historic/Monument",
        location: { type: "Point", coordinates: [-74.0445, 40.6892], borough: "Manhattan", neighborhood: "Liberty Island" },
        vibe_metadata: {
            description: "Colossal neoclassical sculpture on Liberty Island.",
            tags: ["history", "iconic", "monument", "ferry"],
            best_time_to_visit: "Morning first ferry."
        }
    },
    {
        name: "Brooklyn Bridge",
        category: "Historic/Infrastructure",
        location: { type: "Point", coordinates: [-73.9969, 40.7061], borough: "Manhattan/Brooklyn", neighborhood: "Two Bridges/DUMBO" },
        vibe_metadata: {
            description: "Hybrid cable-stayed/suspension bridge connecting Manhattan and Brooklyn.",
            tags: ["view", "walk", "photo", "free"],
            best_time_to_visit: "Sunrise or golden hour."
        }
    },
    {
        name: "Times Square",
        category: "Attraction/Commercial",
        location: { type: "Point", coordinates: [-73.9855, 40.7580], borough: "Manhattan", neighborhood: "Theater District" },
        vibe_metadata: {
            description: "Major commercial intersection, tourist destination, and entertainment center.",
            tags: ["bright", "busy", "shopping", "theater"],
            best_time_to_visit: "Late night for lights."
        }
    },
    {
        name: "One World Trade Center",
        category: "Attraction/Architecture",
        location: { type: "Point", coordinates: [-74.0134, 40.7127], borough: "Manhattan", neighborhood: "Financial District" },
        vibe_metadata: {
            description: "The main building of the rebuilt World Trade Center complex.",
            tags: ["view", "modern", "memorial", "architecture"],
            best_time_to_visit: "Clear days."
        }
    },
    {
        name: "The High Line",
        category: "Park/Attraction",
        location: { type: "Point", coordinates: [-74.0048, 40.7480], borough: "Manhattan", neighborhood: "Chelsea" },
        vibe_metadata: {
            description: "1.45-mile-long elevated linear park created on a former New York Central Railroad spur.",
            tags: ["walk", "art", "garden", "urban"],
            best_time_to_visit: "Weekday mornings."
        }
    },
    {
        name: "Grand Central Terminal",
        category: "Historic/Infrastructure",
        location: { type: "Point", coordinates: [-73.9772, 40.7527], borough: "Manhattan", neighborhood: "Midtown" },
        vibe_metadata: {
            description: "World-famous commuter rail terminal known for its Beaux-Arts architecture.",
            tags: ["architecture", "history", "food", "transit"],
            best_time_to_visit: "Off-peak hours to admire the ceiling."
        }
    },
    {
        name: "Rockefeller Center",
        category: "Attraction/Shopping",
        location: { type: "Point", coordinates: [-73.9787, 40.7587], borough: "Manhattan", neighborhood: "Midtown" },
        vibe_metadata: {
            description: "Large complex of 19 commercial buildings covering 22 acres.",
            tags: ["shopping", "view", "skating", "television"],
            best_time_to_visit: "Christmas season or early morning."
        }
    },
    {
        name: "The Metropolitan Museum of Art",
        category: "Museum/Culture",
        location: { type: "Point", coordinates: [-73.9632, 40.7794], borough: "Manhattan", neighborhood: "Upper East Side" },
        vibe_metadata: {
            description: "The largest art museum in the Americas.",
            tags: ["art", "history", "culture", "museum"],
            best_time_to_visit: "Friday nights."
        }
    }
];

async function seed() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();

        // Use the same DB name as server.js uses for landmarks
        const bostonDb = client.db('boston_database');
        const landmarksCol = bostonDb.collection('boston_landmarks');

        console.log(`🔌 Connected. Seeding ${LANDMARKS.length} landmarks into 'boston_database.boston_landmarks'...`);

        let added = 0;
        let skipped = 0;

        for (const l of LANDMARKS) {
            const exists = await landmarksCol.findOne({ name: l.name });
            if (!exists) {
                await landmarksCol.insertOne({
                    ...l,
                    createdAt: new Date(),
                    vibe_score: 0.9 + (Math.random() * 0.1) // Fake high vibe score
                });
                added++;
            } else {
                skipped++;
            }
        }

        console.log(`✅ Seed Complete. Added: ${added}, Skipped (Exists): ${skipped}`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

seed();
