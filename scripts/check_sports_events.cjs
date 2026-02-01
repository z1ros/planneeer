const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function checkSportsEvents() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('Connected to MongoDB\n');

        const db = client.db('nyc');
        const eventsV1 = db.collection('events');
        const eventsV2 = db.collection('events_v2');

        // Count totals
        const v1Count = await eventsV1.countDocuments();
        const v2Count = await eventsV2.countDocuments();

        console.log('=== EVENT COUNTS ===');
        console.log(`events (v1):    ${v1Count}`);
        console.log(`events_v2:      ${v2Count}`);

        // Search for sports events in both collections
        const sportsTerms = ['football', 'soccer', 'NFL', 'MLS', 'Giants', 'Jets', 'NYCFC', 'Red Bulls', 'game', 'stadium'];

        console.log('\n=== SPORTS EVENTS IN V1 (events) ===');
        for (const term of sportsTerms) {
            const results = await eventsV1.find({
                $or: [
                    { title: { $regex: new RegExp(term, 'i') } },
                    { name: { $regex: new RegExp(term, 'i') } },
                    { description: { $regex: new RegExp(term, 'i') } },
                    { categories: { $regex: new RegExp(term, 'i') } }
                ]
            }).project({ title: 1, name: 1, embedding: 1 }).toArray();

            if (results.length > 0) {
                console.log(`\n"${term}" - Found ${results.length}:`);
                results.slice(0, 5).forEach(r => {
                    const hasEmbed = r.embedding ? '✓ vectorized' : '✗ no embedding';
                    console.log(`  - ${r.title || r.name} [${hasEmbed}]`);
                });
                if (results.length > 5) console.log(`  ... and ${results.length - 5} more`);
            }
        }

        console.log('\n\n=== SPORTS EVENTS IN V2 (events_v2) ===');
        for (const term of sportsTerms) {
            const results = await eventsV2.find({
                $or: [
                    { title: { $regex: new RegExp(term, 'i') } },
                    { name: { $regex: new RegExp(term, 'i') } },
                    { description: { $regex: new RegExp(term, 'i') } },
                    { categories: { $regex: new RegExp(term, 'i') } }
                ]
            }).project({ title: 1, name: 1, embedding: 1, venue: 1 }).toArray();

            if (results.length > 0) {
                console.log(`\n"${term}" - Found ${results.length}:`);
                results.slice(0, 5).forEach(r => {
                    const hasEmbed = r.embedding ? '✓ vectorized' : '✗ no embedding';
                    const hasVenue = r.venue?.lat ? '✓ has coords' : '✗ no coords';
                    console.log(`  - ${r.title || r.name} [${hasEmbed}] [${hasVenue}]`);
                });
                if (results.length > 5) console.log(`  ... and ${results.length - 5} more`);
            }
        }

        // Check if any events in v2 have venue coordinates
        const v2WithCoords = await eventsV2.countDocuments({
            $or: [
                { 'venue.lat': { $exists: true } },
                { 'location.coordinates': { $exists: true } }
            ]
        });
        console.log(`\n\n=== SUMMARY ===`);
        console.log(`events_v2 with coordinates: ${v2WithCoords}/${v2Count}`);

        const v2WithEmbedding = await eventsV2.countDocuments({ embedding: { $exists: true } });
        console.log(`events_v2 with embeddings:  ${v2WithEmbedding}/${v2Count}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

checkSportsEvents();
