const fs = require('fs');

const data = JSON.parse(fs.readFileSync('src/data/nycSubwayRoutes.json', 'utf8'));
const features = data.features;

const targetIds = ['L', 'N', 'Q'];
const found = {};

features.forEach(f => {
    const rid = f.properties.route_id;
    if (targetIds.includes(rid)) {
        found[rid] = true;
    }
});

console.log('Found route IDs:', Object.keys(found));

// Print first 5 route_ids to see format
console.log('Sample route_ids:', features.slice(0, 5).map(f => `"${f.properties.route_id}"`));
