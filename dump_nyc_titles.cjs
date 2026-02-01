
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

async function dumpTitles() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db('nyc');

        console.log('--- NYC EVENTS (nyc.events) ---');
        const titles1 = await db.collection('events').find({}).project({ title: 1, name: 1 }).toArray();
        titles1.forEach(t => console.log(` - ${t.title || t.name}`));

        console.log('\n--- NYC EVENTS V2 (nyc.events_v2) ---');
        const titles2 = await db.collection('events_v2').find({}).project({ title: 1, name: 1 }).toArray();
        titles2.forEach(t => console.log(` - ${t.title || t.name}`));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

dumpTitles();
