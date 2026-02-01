
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function searchBostonFootball() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('boston_database');
        const col = db.collection('boston_events');

        const query = {
            $or: [
                { name: { $regex: /football|NFL|Patriots/i } },
                { description: { $regex: /football|NFL|Patriots/i } }
            ]
        };
        const results = await col.find(query).toArray();
        console.log(`--- Boston Football Search Results ---`);
        console.log(`Found: ${results.length}`);
        results.forEach(r => {
            console.log(` - ${r.name} (${r.start_time})`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

searchBostonFootball();
