/**
 * Vectorize NYC Data Script
 *
 * This script adds embeddings to restaurants, events, and landmarks
 * using Gemini's text-embedding-004 model.
 *
 * Run: node scripts/vectorize-nyc.js
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';

// Rate limiting
const DELAY_MS = 100; // Delay between API calls to avoid rate limits
const BATCH_SIZE = 50; // Process in batches

/**
 * Get embedding for text using Gemini API
 */
async function getEmbedding(text) {
    try {
        const response = await fetch(`${EMBEDDING_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/text-embedding-004',
                content: { parts: [{ text }] }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.embedding?.values || null;
    } catch (error) {
        console.error('Embedding error:', error.message);
        return null;
    }
}

/**
 * Build searchable text from a restaurant document
 */
function buildRestaurantText(doc) {
    const parts = [];

    if (doc.name) parts.push(`Name: ${doc.name}`);
    if (doc.businessname) parts.push(`Name: ${doc.businessname}`);
    if (doc.cuisine) parts.push(`Cuisine: ${doc.cuisine}`);
    if (doc.categories) {
        const cats = Array.isArray(doc.categories) ? doc.categories.join(', ') : doc.categories;
        parts.push(`Categories: ${cats}`);
    }
    if (doc.vibe_metadata?.description) parts.push(`Description: ${doc.vibe_metadata.description}`);
    if (doc.vibe_metadata?.tags) parts.push(`Tags: ${doc.vibe_metadata.tags.join(', ')}`);
    if (doc.vibe_metadata?.ideal_for) parts.push(`Ideal for: ${doc.vibe_metadata.ideal_for.join(', ')}`);
    if (doc.address) parts.push(`Location: ${doc.address}`);
    if (doc.neighborhood) parts.push(`Neighborhood: ${doc.neighborhood}`);

    return parts.join('\n').trim();
}

/**
 * Build searchable text from an event document
 */
function buildEventText(doc) {
    const parts = [];

    if (doc.title) parts.push(`Event: ${doc.title}`);
    if (doc.name) parts.push(`Event: ${doc.name}`);
    if (doc.description) parts.push(`Description: ${doc.description}`);
    if (doc.category) parts.push(`Category: ${doc.category}`);
    if (doc.venue?.name) parts.push(`Venue: ${doc.venue.name}`);
    if (doc.tags) parts.push(`Tags: ${doc.tags.join(', ')}`);
    if (doc.vibe_metadata?.description) parts.push(`Vibe: ${doc.vibe_metadata.description}`);
    if (doc.vibe_metadata?.tags) parts.push(`Vibe tags: ${doc.vibe_metadata.tags.join(', ')}`);

    return parts.join('\n').trim();
}

/**
 * Build searchable text from a landmark document
 */
function buildLandmarkText(doc) {
    const parts = [];

    if (doc.name) parts.push(`Landmark: ${doc.name}`);
    if (doc.category) parts.push(`Category: ${doc.category}`);
    if (doc.description) parts.push(`Description: ${doc.description}`);
    if (doc.vibe_metadata?.description) parts.push(`Vibe: ${doc.vibe_metadata.description}`);
    if (doc.vibe_metadata?.tags) parts.push(`Tags: ${doc.vibe_metadata.tags.join(', ')}`);
    if (doc.vibe_metadata?.best_time_to_visit) parts.push(`Best time: ${doc.vibe_metadata.best_time_to_visit}`);
    if (doc.vibe_metadata?.pro_tip) parts.push(`Pro tip: ${doc.vibe_metadata.pro_tip}`);

    return parts.join('\n').trim();
}

/**
 * Process a collection and add embeddings
 */
async function vectorizeCollection(collection, collectionName, textBuilder) {
    console.log(`\n--- Processing ${collectionName} ---`);

    // Find documents without embeddings
    const cursor = collection.find({ embedding: { $exists: false } }).limit(BATCH_SIZE);
    const docs = await cursor.toArray();

    if (docs.length === 0) {
        console.log(`No documents to vectorize in ${collectionName}`);
        return 0;
    }

    console.log(`Found ${docs.length} documents to vectorize`);
    let processed = 0;
    let failed = 0;

    for (const doc of docs) {
        const text = textBuilder(doc);

        if (!text || text.length < 10) {
            console.log(`  Skipping ${doc._id}: insufficient text`);
            failed++;
            continue;
        }

        const embedding = await getEmbedding(text);

        if (embedding) {
            await collection.updateOne(
                { _id: doc._id },
                { $set: { embedding } }
            );
            processed++;
            const name = doc.name || doc.businessname || doc.title || doc._id;
            console.log(`  [${processed}/${docs.length}] Vectorized: ${name}`);
        } else {
            failed++;
            console.log(`  Failed: ${doc._id}`);
        }

        // Rate limiting delay
        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`\n${collectionName} complete: ${processed} success, ${failed} failed`);
    return processed;
}

/**
 * Main vectorization function
 */
async function main() {
    console.log('='.repeat(50));
    console.log('NYC Data Vectorization Script');
    console.log('='.repeat(50));

    if (!GEMINI_API_KEY) {
        console.error('ERROR: GEMINI_API_KEY not found in .env');
        process.exit(1);
    }

    if (!MONGODB_URI) {
        console.error('ERROR: MONGODB_URI not found in .env');
        process.exit(1);
    }

    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('Connected to MongoDB');

        // NYC database (all collections are here)
        const nycDb = client.db('nyc');
        const restaurants = nycDb.collection('restaurants');
        const events = nycDb.collection('events_v2');
        const landmarks = nycDb.collection('landmarks');

        // Get counts
        const restaurantCount = await restaurants.countDocuments();
        const eventCount = await events.countDocuments();
        const landmarkCount = await landmarks.countDocuments();

        console.log(`\nCollections found:`);
        console.log(`  - restaurants: ${restaurantCount} docs`);
        console.log(`  - events_v2: ${eventCount} docs`);
        console.log(`  - landmarks: ${landmarkCount} docs`);

        // Count already vectorized
        const restaurantsVectorized = await restaurants.countDocuments({ embedding: { $exists: true } });
        const eventsVectorized = await events.countDocuments({ embedding: { $exists: true } });
        const landmarksVectorized = await landmarks.countDocuments({ embedding: { $exists: true } });

        console.log(`\nAlready vectorized:`);
        console.log(`  - restaurants: ${restaurantsVectorized}/${restaurantCount}`);
        console.log(`  - events: ${eventsVectorized}/${eventCount}`);
        console.log(`  - landmarks: ${landmarksVectorized}/${landmarkCount}`);

        // Process each collection
        let totalProcessed = 0;

        totalProcessed += await vectorizeCollection(restaurants, 'restaurants', buildRestaurantText);
        totalProcessed += await vectorizeCollection(events, 'events_v2', buildEventText);
        totalProcessed += await vectorizeCollection(landmarks, 'landmarks', buildLandmarkText);

        console.log('\n' + '='.repeat(50));
        console.log(`COMPLETE: Vectorized ${totalProcessed} total documents`);
        console.log('='.repeat(50));

        // Check remaining
        const remainingRestaurants = await restaurants.countDocuments({ embedding: { $exists: false } });
        const remainingEvents = await events.countDocuments({ embedding: { $exists: false } });
        const remainingLandmarks = await landmarks.countDocuments({ embedding: { $exists: false } });

        if (remainingRestaurants + remainingEvents + remainingLandmarks > 0) {
            console.log(`\nRemaining to vectorize:`);
            console.log(`  - restaurants: ${remainingRestaurants}`);
            console.log(`  - events: ${remainingEvents}`);
            console.log(`  - landmarks: ${remainingLandmarks}`);
            console.log('\nRun this script again to continue processing.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
        console.log('\nDisconnected from MongoDB');
    }
}

main();
