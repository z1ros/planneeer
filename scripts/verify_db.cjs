
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkDB() {
    if (!MONGODB_URI) {
        console.error('Error: MONGODB_URI not found in .env');
        process.exit(1);
    }

    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db('nyc');

        // Check friction_reports
        const frictionCollection = db.collection('friction_reports');
        const frictionCount = await frictionCollection.countDocuments();
        console.log(`\n[friction_reports] Count: ${frictionCount}`);

        if (frictionCount > 0) {
            const frictionDocs = await frictionCollection.find({}).limit(3).toArray();
            console.log('Sample friction reports:', JSON.stringify(frictionDocs, null, 2));
        }

        // Check landmarks
        const landmarkCollection = db.collection('landmarks');
        const landmarkCount = await landmarkCollection.countDocuments();
        console.log(`\n[landmarks] Count: ${landmarkCount}`);

        if (landmarkCount > 0) {
            const landmarkDocs = await landmarkCollection.find({}).limit(3).toArray();
            console.log('Sample landmarks:', JSON.stringify(landmarkDocs, null, 2));
        }

    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        await client.close();
    }
}

checkDB();
