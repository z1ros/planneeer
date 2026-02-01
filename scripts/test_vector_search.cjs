
const fetch = require('node-fetch');

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

async function testVectorSearch() {
    console.log('🧪 Testing Vector Search...\n');

    const testQueries = [
        { query: 'mexican food', expected: 'Mexican restaurants' },
        { query: 'indian restaurants', expected: 'Indian cuisine' },
        { query: 'football events', expected: 'Football/sports events' },
        { query: 'empire state building', expected: 'Empire State Building landmark' }
    ];

    for (const test of testQueries) {
        console.log(`\n🔍 Query: "${test.query}"`);
        console.log(`   Expected: ${test.expected}`);

        try {
            const response = await fetch(`${API_URL}/api/plan/smart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: test.query,
                    location: { lat: 40.7580, lng: -73.9855 } // Times Square
                })
            });

            if (!response.ok) {
                console.log(`   ❌ API Error: ${response.status} ${response.statusText}`);
                const text = await response.text();
                console.log(`   Response: ${text.substring(0, 200)}`);
                continue;
            }

            const data = await response.json();

            console.log(`   ✅ Response received (${data.took_ms}ms)`);
            console.log(`   Found: ${data.searchResults?.places || 0} restaurants, ${data.searchResults?.events || 0} events, ${data.searchResults?.landmarks || 0} landmarks`);

            if (data.plans?.A?.items?.length > 0) {
                console.log(`   📍 Plan A Top Result: ${data.plans.A.items[0].name}`);
            }

            if (data.plans?.B?.items?.length > 0) {
                console.log(`   📍 Plan B Top Result: ${data.plans.B.items[0].name}`);
            }

        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            if (error.code === 'ECONNREFUSED') {
                console.log('\n⚠️  Server is not running! Start it with: npm run dev\n');
                return;
            }
        }
    }

    console.log('\n✅ Vector search test complete!\n');
}

testVectorSearch();
