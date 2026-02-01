
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required in .env');
    process.exit(1);
}

async function verify() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('🔌 Connected to MongoDB');

        const db = client.db('nyc');

        // Corrected collection list based on user screenshot
        const collections = ['events_v2', 'events', 'landmarks', 'restaurants'];

        console.log('\n📊 DATABASE AUDIT (nyc):');

        for (const colName of collections) {
            const col = db.collection(colName);
            const count = await col.countDocuments();
            const withEmbedding = await col.countDocuments({ embedding: { $exists: true, $ne: null } });

            console.log(`\nCollection: '${colName}'`);
            console.log(`- Total Items:   ${count}`);
            console.log(`- Vectorized:    ${withEmbedding}`);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.close();
    }
}

verify();
