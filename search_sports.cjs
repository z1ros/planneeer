
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function searchSports() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('nyc');
        const col = db.collection('events');

        const keywords = ['NFL', 'Giants', 'Jets', 'sports', 'game', 'football', 'soccer'];

        console.log('--- Broad Sports Search (events_v2) ---');
        for (const kw of keywords) {
            const query = {
                $or: [
                    { title: { $regex: new RegExp(kw, 'i') } },
                    { description: { $regex: new RegExp(kw, 'i') } },
                    { categories: { $regex: new RegExp(kw, 'i') } }
                ]
            };
            const count = await col.countDocuments(query);
            console.log(`Keyword: "${kw}" -> Found: ${count}`);
        }

        // Just list first 5 events to see what they look like
        const samples = await col.find({}).limit(5).toArray();
        console.log('\n--- Sample Events (Any) ---');
        samples.forEach(s => console.log(` - ${s.title || s.name}`));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

searchSports();
