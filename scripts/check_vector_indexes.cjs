
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required in .env');
    process.exit(1);
}

async function checkIndexes() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        console.log('🔌 Connected to MongoDB Atlas');

        const db = client.db('nyc');

        const collections = ['restaurants', 'events_v2', 'landmarks'];

        console.log('\n📊 VECTOR INDEX CHECK:\n');

        for (const colName of collections) {
            const col = db.collection(colName);
            const indexes = await col.indexes();

            console.log(`Collection: '${colName}'`);
            console.log('Indexes:');
            indexes.forEach(idx => {
                console.log(`  - ${idx.name} (type: ${idx.key ? 'standard' : 'unknown'})`);
            });

            // Check if vector index exists (will be a search index, not listed in .indexes())
            console.log('  ⚠️  Vector indexes (Atlas Search) are NOT shown via .indexes()');
            console.log('     You must check these in MongoDB Atlas UI → Search → Indexes\n');
        }

        console.log('\n✅ REQUIRED VECTOR INDEXES (create these in Atlas):');
        console.log('  1. Collection: restaurants');
        console.log('     Index Name: restaurant_vector_index');
        console.log('     Type: vectorSearch');
        console.log('     Field: embedding');
        console.log('     Dimensions: 768');
        console.log('     Similarity: cosine\n');

        console.log('  2. Collection: events_v2');
        console.log('     Index Name: event_vector_index');
        console.log('     Type: vectorSearch');
        console.log('     Field: embedding');
        console.log('     Dimensions: 768');
        console.log('     Similarity: cosine\n');

        console.log('  3. Collection: landmarks');
        console.log('     Index Name: landmark_vector_index');
        console.log('     Type: vectorSearch');
        console.log('     Field: embedding');
        console.log('     Dimensions: 768');
        console.log('     Similarity: cosine\n');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.close();
    }
}

checkIndexes();
