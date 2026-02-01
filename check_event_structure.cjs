
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required in .env');
    process.exit(1);
}

async function check() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        const db = client.db('nyc');

        const col = db.collection('events');
        const colV2 = db.collection('events_v2');

        const sample = await col.findOne({});
        console.log('SAMPLE EVENT STRUCTURE (events):');
        console.log(JSON.stringify(sample, null, 2));

        const sampleV2 = await colV2.findOne({});
        console.log('\nSAMPLE EVENT STRUCTURE (events_v2):');
        console.log(JSON.stringify(sampleV2, null, 2));

        const countWithLocation = await col.countDocuments({ location: { $exists: true } });
        const countWithCoordinates = await col.countDocuments({ 'location.coordinates': { $exists: true } });

        const countV2WithLocation = await colV2.countDocuments({ location: { $exists: true } });
        const countV2WithCoordinates = await colV2.countDocuments({ 'location.coordinates': { $exists: true } });

        console.log(`\nStats (events):`);
        console.log(`- Total events: ${await col.countDocuments()}`);
        console.log(`- events with 'location': ${countWithLocation}`);
        console.log(`- events with 'location.coordinates': ${countWithCoordinates}`);

        console.log(`\nStats (events_v2):`);
        console.log(`- Total events_v2: ${await colV2.countDocuments()}`);
        console.log(`- events_v2 with 'location': ${countV2WithLocation}`);
        console.log(`- events_v2 with 'location.coordinates': ${countV2WithCoordinates}`);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.close();
    }
}

check();
