
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

        const eventsv2 = db.collection('events_v2');
        const eventsLegacy = db.collection('events');
        const restaurants = db.collection('restaurants');

        const eventCountv2 = await eventsv2.countDocuments();
        const eventCountLegacy = await eventsLegacy.countDocuments();
        const restaurantCount = await restaurants.countDocuments();

        // Check for "Hidden Gems" in v2
        const hiddenGemsV2 = await eventsv2.countDocuments({
            $or: [
                { isHiddenGem: true },
                { source: 'reddit' },
                { tags: { $in: ['hidden-gem', 'reddit'] } }
            ]
        });

        // Check for "Hidden Gems" in Legacy
        const hiddenGemsLegacy = await eventsLegacy.countDocuments({
            $or: [
                { isHiddenGem: true },
                { source: 'reddit' },
                { tags: { $in: ['hidden-gem', 'reddit'] } }
            ]
        });

        const missingEmbeddingsResult = await eventsv2.countDocuments({ embedding: { $exists: false } });

        console.log('\n📊 DATABASE STATUS (nyc):');
        console.log(`- Events V2:        ${eventCountv2}`);
        console.log(`- Events Legacy:    ${eventCountLegacy}`);
        console.log(`- Restaurants:      ${restaurantCount}`);
        console.log(`- Hidden Gems (V2): ${hiddenGemsV2}`);
        console.log(`- Hidden Gems (Leg):${hiddenGemsLegacy}`);
        console.log(`- Need Vectorizing: ${missingEmbeddingsResult}`);



        if (hiddenGemsV2 > 0 || hiddenGemsLegacy > 0) {
            console.log('\n✅ Hidden Gems found in database!');
        } else {
            console.log('\n⚠️ No obvious "Hidden Gem" flags found.');
        }


        // Dump source distribution
        console.log('\n🔎 SOURCE DISTRIBUTION (V2):');
        const sources = await eventsv2.distinct('source');
        for (const s of sources) {
            const count = await eventsv2.countDocuments({ source: s });
            console.log(`- ${s}: ${count}`);
        }

        const redditCount = await eventsv2.countDocuments({
            $or: [{ source: /reddit/i }, { description: /reddit/i }]
        });
        console.log(`\n- Reddit Search Matches: ${redditCount}`);


        // Search for specific known gems from the log
        console.log('\n🔎 LOOKING FOR "Ittadi" or "Ottomanelli":');
        const knownGem = await eventsv2.findOne({
            $or: [
                { title: /Ittadi/i },
                { description: /Ittadi/i },
                { name: /Ittadi/i },
                { title: /Ottomanelli/i }
            ]
        });

        if (knownGem) {
            console.log('✅ FOUND "Ittadi/Ottomanelli" in events_v2!');
            console.log(JSON.stringify(knownGem, null, 2));
        } else {
            console.log('❌ "Ittadi" NOT found in events_v2. Checking legacy events...');
            const legacyGem = await eventsLegacy.findOne({
                $or: [
                    { title: /Ittadi/i },
                    { name: /Ittadi/i }
                ]
            });
            if (legacyGem) {
                console.log('✅ FOUND "Ittadi" in legacy events!');
                console.log(JSON.stringify(legacyGem, null, 2));
            } else {
                console.log('❌ "Ittadi" NOT found in legacy events either.');
            }
        }




    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.close();
    }
}

verify();
