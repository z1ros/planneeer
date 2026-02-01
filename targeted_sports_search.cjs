
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function targetedSearch() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('nyc');
        const collections = ['events', 'events_v2', 'landmarks', 'restaurants'];

        const terms = ['football', 'NFL', 'Giants', 'Jets', 'soccer', 'MLS', 'Stadio'];

        console.log('--- Targeted Sports Data Search ---');
        for (const colName of collections) {
            const col = db.collection(colName);
            for (const term of terms) {
                const query = {
                    $or: [
                        { title: { $regex: new RegExp(`\\b${term}\\b`, 'i') } },
                        { name: { $regex: new RegExp(`\\b${term}\\b`, 'i') } },
                        { description: { $regex: new RegExp(`\\b${term}\\b`, 'i') } },
                        { categories: { $regex: new RegExp(`\\b${term}\\b`, 'i') } }
                    ]
                };
                const results = await col.find(query).project({ title: 1, name: 1 }).toArray();
                if (results.length > 0) {
                    console.log(`\n[${colName}] Term: "${term}" -> Found ${results.length}`);
                    results.forEach(r => console.log(` - ${r.title || r.name}`));
                }
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

targetedSearch();
