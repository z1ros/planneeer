
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function testEventVectorSearch() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        const db = client.db('nyc');
        const events = db.collection('events');

        // Check sample event
        const sample = await events.findOne({});
        console.log('📝 Sample Event:');
        console.log('  Title:', sample.title);
        console.log('  Has embedding:', !!sample.embedding);
        console.log('  Embedding length:', sample.embedding?.length);

        // Get query embedding
        const query = 'music concert';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/text-embedding-004',
                content: { parts: [{ text: query }] }
            })
        });

        const data = await response.json();
        const queryEmbedding = data.embedding?.values;

        console.log('\n🔍 Query:', query);
        console.log('  Embedding length:', queryEmbedding?.length);

        // Try vector search
        console.log('\n🧪 Testing Vector Search...');
        const results = await events.aggregate([
            {
                $vectorSearch: {
                    index: 'event_vector_index',
                    path: 'embedding',
                    queryVector: queryEmbedding,
                    numCandidates: 100,
                    limit: 5
                }
            },
            {
                $addFields: { score: { $meta: 'vectorSearchScore' } }
            },
            {
                $project: { title: 1, description: 1, score: 1, _id: 0 }
            }
        ]).toArray();

        console.log('✅ Results:', results.length);
        results.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.title} (score: ${r.score?.toFixed(3)})`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('$vectorSearch')) {
            console.log('\n⚠️  Vector index might not be ready yet or name mismatch');
        }
    } finally {
        await client.close();
    }
}

testEventVectorSearch();
