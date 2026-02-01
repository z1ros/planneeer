
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function findFootball() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('nyc');
        const bostonDb = client.db('boston_database');
        const collections = [
            { db: db, name: 'events' },
            { db: db, name: 'events_v2' },
            { db: db, name: 'landmarks' },
            { db: db, name: 'restaurants' },
            { db: db, name: 'hidden_events' },
            { db: bostonDb, name: 'boston_events' },
            { db: bostonDb, name: 'boston_landmarks' }
        ];

        console.log('--- Football Search Results ---');
        for (const colInfo of collections) {
            const col = colInfo.db.collection(colInfo.name);
            const query = {
                $or: [
                    { name: { $regex: /football/i } },
                    { title: { $regex: /football/i } },
                    { description: { $regex: /football/i } },
                    { categories: { $regex: /football/i } },
                    { tags: { $regex: /football/i } }
                ]
            };
            const results = await col.find(query).toArray();
            console.log(`\nCollection: ${colInfo.name}`);
            console.log(`Found: ${results.length}`);
            if (results.length > 0) {
                results.slice(0, 3).forEach(r => {
                    console.log(` - ${r.name || r.title} (${r._id})`);
                });
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

findFootball();
