
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required in .env');
    process.exit(1);
}

// Base categories to expand
const CATEGORIES = [
    { type: 'Museum', base: ['Metropolitan', 'Modern Art', 'Natural History', 'Brooklyn', 'Whitney', 'Guggenheim', 'Tenement', 'Moving Image', 'Transit', 'City', 'Jewish', 'Sex', 'Ice Cream', 'Spy', 'Mathematics', 'Design', 'Illustration', 'Folk Art', 'Poster', 'Maritime'] },
    { type: 'Park', base: ['Central', 'Prospect', 'Riverside', 'Battery', 'Bryant', 'Washington Square', 'High Line', 'Fort Greene', 'McCarren', 'Flushing Meadows', 'Van Cortlandt', 'Pelham Bay', 'Inwood Hill', 'Tompkins Square', 'Union Square', 'Madison Square', 'Sara D. Roosevelt', 'Seward', 'Corlears Hook', 'East River'] },
    { type: 'Library', base: ['NYPL Main', 'Brooklyn Central', 'Jefferson Market', 'Schomburg Center', 'Stavros Niarchos', 'Morgan', 'Poets House', 'New York Society', 'Grolier Club', 'Center for Fiction'] },
    { type: 'Historic', base: ['Empire State', 'Chrysler', 'Flatiron', 'Woolworth', 'Dakota', 'Plaza Hotel', 'Waldorf Astoria', 'Grand Central', 'Penn Station', 'Oculus', 'Trinity Church', 'St. Patricks', 'Cathedral St. John', 'Gracie Mansion', 'City Hall', 'Custom House', 'Federal Hall', 'Fraunces Tavern', 'Stonewall Inn', 'Apollo Theater'] },
    { type: 'Theater', base: ['Lyceum', 'New Amsterdam', 'Winter Garden', 'Majestic', 'St. James', 'Palace', 'Imperial', 'Music Box', 'Booth', 'Shubert', 'Broadhurst', 'Belasco', 'Hirschfeld', 'Sondheim', 'Wilson', 'Gershwin', 'Minskoff', 'Lunt-Fontanne', 'Richard Rodgers', 'Neil Simon'] }
];

// Helper to generate coordinates roughly in NYC
function randomCoord() {
    // NYC Bounding Box roughly: -74.05 to -73.90 (Lng), 40.65 to 40.85 (Lat)
    const lng = -74.02 + Math.random() * 0.15;
    const lat = 40.68 + Math.random() * 0.15;
    return [lng, lat];
}

async function seed() {
    const client = new MongoClient(MONGODB_URI);

    try {
        await client.connect();
        const db = client.db('boston_database');
        const col = db.collection('boston_landmarks');

        console.log('🔌 Connected. Generating 250 landmarks...');

        const existingCount = await col.countDocuments();
        const target = 250;
        let generated = 0;

        // Generate list
        const bulkOps = [];

        for (const cat of CATEGORIES) {
            for (const name of cat.base) {
                // Main item
                const fullName = name.includes(cat.type) ? name : `${name} ${cat.type}`;

                bulkOps.push({
                    insertOne: {
                        document: {
                            name: fullName,
                            category: cat.type,
                            location: {
                                type: 'Point',
                                coordinates: randomCoord(),
                                borough: "Manhattan", // Simplified for bulk generation
                                neighborhood: "NYC"
                            },
                            vibe_metadata: {
                                description: `A famous ${cat.type.toLowerCase()} in NYC.`,
                                tags: ["landmark", cat.type.toLowerCase(), "nyc"],
                                vibe_score: 0.8 + Math.random() * 0.2
                            },
                            createdAt: new Date()
                        }
                    }
                });
                generated++;

                // Variate to hit 250 (e.g. "North", "South", "Annex") if needed
                if (generated < target) {
                    bulkOps.push({
                        insertOne: {
                            document: {
                                name: `${fullName} Annex`,
                                category: cat.type,
                                location: { type: 'Point', coordinates: randomCoord(), borough: "Manhattan", neighborhood: "NYC" },
                                vibe_metadata: { description: `Annex location of ${fullName}.`, tags: ["landmark", "annex"], vibe_score: 0.7 },
                                createdAt: new Date()
                            }
                        }
                    });
                    generated++;
                }
                if (generated < target) {
                    bulkOps.push({
                        insertOne: {
                            document: {
                                name: `${fullName} Plaza`,
                                category: cat.type,
                                location: { type: 'Point', coordinates: randomCoord(), borough: "Manhattan", neighborhood: "NYC" },
                                vibe_metadata: { description: `Public plaza near ${fullName}.`, tags: ["landmark", "plaza"], vibe_score: 0.75 },
                                createdAt: new Date()
                            }
                        }
                    });
                    generated++;
                }
            }
        }

        // Fill remaining if any
        let i = 0;
        while (generated < target - existingCount) {
            bulkOps.push({
                insertOne: {
                    document: {
                        name: `Hidden Landmark #${i++}`,
                        category: "Hidden Gem",
                        location: { type: 'Point', coordinates: randomCoord(), borough: "NYC", neighborhood: "Unknown" },
                        vibe_metadata: { description: `A secret spot in NYC.`, tags: ["hidden", "secret"], vibe_score: 0.9 },
                        createdAt: new Date()
                    }
                }
            });
            generated++;
        }

        if (bulkOps.length > 0) {
            await col.bulkWrite(bulkOps);
            console.log(`✅ Bulk inserted ${bulkOps.length} landmarks.`);
        } else {
            console.log('✨ Data already sufficient.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

seed();
