
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required in .env');
    process.exit(1);
}

async function migrate() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('🔌 Connected to MongoDB');

        const db = client.db('nyc');
        const legacyEvents = db.collection('events');
        const v2Events = db.collection('events_v2');

        const cursor = legacyEvents.find({});
        const count = await legacyEvents.countDocuments();

        console.log(`📦 Migrating ${count} events from 'events' -> 'events_v2'...`);

        let migrated = 0;
        let skipped = 0;

        while (await cursor.hasNext()) {
            const item = await cursor.next();

            // detailed check to avoid duplicates based on title/name
            const exists = await v2Events.findOne({
                $or: [
                    { title: item.title },
                    { name: item.name || item.title }
                ]
            });

            if (!exists) {
                // standardize fields if needed
                const newItem = {
                    ...item,
                    migrated: true,
                    migratedAt: new Date()
                };

                // If it has no 'name' but has 'title', copy title to name
                if (!newItem.name && newItem.title) newItem.name = newItem.title;

                await v2Events.insertOne(newItem);
                migrated++;
            } else {
                skipped++;
            }

            if (migrated % 10 === 0) process.stdout.write(`\r🚀 Migrated: ${migrated} | Skipped: ${skipped}`);
        }

        console.log(`\n\n✅ DONE! Migrated: ${migrated}, Skipped (Duplicates): ${skipped}`);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.close();
    }
}

migrate();
