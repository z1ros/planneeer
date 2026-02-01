const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:3000';

async function testFeeds() {
    const feeds = ['ace', 'bdfm', 'g', 'jz', 'nqrw', '1234567'];

    console.log('Fetching feeds...');

    for (const feed of feeds) {
        try {
            const url = `${API_BASE_URL}/api/mta/${feed}`;
            console.log(`Fetching ${url}...`);
            const res = await fetch(url);

            if (!res.ok) {
                console.error(`Failed to fetch ${feed}: ${res.statusText}`);
                continue;
            }

            const data = await res.json();
            const entities = data.entity || [];
            console.log(`Feed ${feed}: ${entities.length} entities`);

            // Check for Route IDs
            const routeIds = new Set();
            let delayCount = 0;
            let alertCount = 0;

            entities.forEach(entity => {
                if (entity.tripUpdate && entity.tripUpdate.trip) {
                    routeIds.add(entity.tripUpdate.trip.routeId);

                    // Check delays
                    if (entity.tripUpdate.stopTimeUpdate) {
                        entity.tripUpdate.stopTimeUpdate.forEach(stu => {
                            if (stu.arrival?.delay > 60 || stu.departure?.delay > 60) {
                                delayCount++;
                            }
                        });
                    }
                }
                if (entity.alert) {
                    alertCount++;
                    if (entity.alert.informedEntity) {
                        entity.alert.informedEntity.forEach(ie => {
                            if (ie.routeId) routeIds.add(ie.routeId);
                        });
                    }
                }
            });

            console.log(`  Route IDs found: ${Array.from(routeIds).join(', ')}`);
            console.log(`  Delays (>1m) detected chunks: ${delayCount}`);
            console.log(`  Alerts detected: ${alertCount}`);

        } catch (error) {
            console.error(`Error processing ${feed}:`, error);
        }
    }
}

testFeeds();
