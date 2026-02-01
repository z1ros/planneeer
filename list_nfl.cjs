
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function listNFL() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('nyc');
        const col = db.collection('events');

        const query = {
            $or: [
                { title: { $regex: /NFL|game/i } },
                { description: { $regex: /NFL|game/i } }
            ]
        };
        const results = await col.find(query).toArray();
        console.log('--- NFL/Game Event Details ---');
        results.forEach(r => {
            console.log(`\nTitle: ${r.title}`);
            console.log(`Description: ${r.description?.substring(0, 50)}...`);
            console.log(`Categories: ${r.categories?.join(', ')}`);
            console.log(`Venue: ${r.venue?.name}`);
            console.log(`Location: ${JSON.stringify(r.location)}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

listNFL();
