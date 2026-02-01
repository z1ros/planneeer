
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DB_NAME = 'nyc';
const COLLECTIONS = ['events_v2', 'restaurants', 'events', 'landmarks']; // Vectorize all including legacy and landmarks

if (!MONGODB_URI || !GEMINI_API_KEY) {
    console.error('❌ MONGODB_URI and GEMINI_API_KEY are required in .env');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

async function getEmbedding(text) {
    try {
        if (!text || text.length < 5) return null;
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error('⚠️ Embedding error:', error.message);
        return null;
    }
}

async function vectorizeCollection(db, collectionName) {
    const collection = db.collection(collectionName);
    const cursor = collection.find({
        $or: [
            { embedding: { $exists: false } },
            { embedding: null }
        ]
    });

    const count = await collection.countDocuments({
        $or: [
            { embedding: { $exists: false } },
            { embedding: null }
        ]
    });

    console.log(`\n📦 Processing '${collectionName}': Found ${count} items needing vectorization...`);

    let processed = 0;
    let errors = 0;

    while (await cursor.hasNext()) {
        const item = await cursor.next();

        // Construct rich text representation for embedding
        // For events: Title + Description + Categories + Venue
        // For restaurants: Name + Description + Cuisine + Categories
        let textToEmbed = '';

        if (collectionName === 'events_v2') {
            textToEmbed = `${item.title || ''} ${item.description || ''} ${item.venue?.name || ''} ${(item.categories || []).join(' ')}`;
        } else if (collectionName === 'restaurants') {
            textToEmbed = `${item.name || ''} ${item.description || ''} ${item.cuisine || ''} ${(item.categories || []).join(' ')}`;
        } else if (collectionName === 'events') {
            // Legacy events / hidden gems
            textToEmbed = `${item.title || ''} ${item.description || ''} ${item.location || ''} ${item.type || ''}`;
        }

        // Clean text
        textToEmbed = textToEmbed.replace(/\s+/g, ' ').trim().slice(0, 8000); // Truncate if too long for API

        if (textToEmbed.length > 10) {
            const embedding = await getEmbedding(textToEmbed);

            if (embedding) {
                await collection.updateOne(
                    { _id: item._id },
                    { $set: { embedding: embedding } }
                );
                processed++;
                process.stdout.write(`\r✅ Vectorized: ${processed}/${count}`);
            } else {
                errors++;
            }
        } else {
            console.log(`\n⚠️ Skipping short text for: ${item._id}`);
        }

        // Rate limit kindness
        await new Promise(r => setTimeout(r, 100)); // 10 updates/sec max
    }

    console.log(`\n✨ Finished '${collectionName}': ${processed} updated, ${errors} failed.`);
}

async function run() {
    let client;
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('🔌 Connected to MongoDB');

        const db = client.db(DB_NAME);

        for (const col of COLLECTIONS) {
            await vectorizeCollection(db, col);
        }

    } catch (error) {
        console.error('❌ Script Fatal Error:', error);
    } finally {
        if (client) await client.close();
        console.log('👋 Done');
    }
}

run();
