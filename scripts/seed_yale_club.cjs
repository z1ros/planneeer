
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required in .env');
    process.exit(1);
}

const YALE_CLUB = {
    name: "Yale Club of New York City",
    category: "Private Club",
    location: { type: "Point", coordinates: [-73.9774, 40.7533], borough: "Manhattan", neighborhood: "Midtown" },
    address: "50 Vanderbilt Ave, New York, NY 10017",
    vibe_metadata: {
        description: "Private social club for Yale University alumni and faculty. known for networking and business meetings.",
        tags: ["business", "networking", "private club", "exclusive", "midtown"],
        best_time_to_visit: "Weekdays for business lunch."
    },
    price_level: 4,
    rating: 4.6,
    user_rating_count: 500
};

async function seed() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();

        // Use the same DB name as server.js uses for landmarks
        const bostonDb = client.db('boston_database'); // Note: Keeping legacy name as per other files
        const landmarksCol = bostonDb.collection('boston_landmarks');

        console.log(`🔌 Connected. Seeding Yale Club...`);

        const exists = await landmarksCol.findOne({ name: YALE_CLUB.name });
        if (!exists) {
            await landmarksCol.insertOne({
                ...YALE_CLUB,
                createdAt: new Date(),
                vibe_score: 0.95
            });
            console.log('✅ Added Yale Club of New York City to database.');
        } else {
            console.log('⚠️ Yale Club already exists in database. Updating...');
            await landmarksCol.updateOne(
                { name: YALE_CLUB.name },
                {
                    $set: {
                        ...YALE_CLUB,
                        updatedAt: new Date(),
                        vibe_score: 0.95
                    }
                }
            );
            console.log('✅ Updated Yale Club data.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

seed();
