const fs = require('fs');

const data = JSON.parse(fs.readFileSync('src/data/nycSubwayRoutes.json', 'utf8'));

// Search for L, N, Q by name
const targets = ['L', 'N', 'Q'];

data.features.forEach(f => {
    const name = f.properties.name || '';
    const id = f.properties.route_id;

    // Check if name contains L, N, or Q line info
    // Usually names are like "Broadway Line", "Canarsie Line" (L)
    // Let's print name and id for a few hundred items to manually grep conceptually
    // Or searching specifically for common names
});

// Better approach: Aggregate all unique Name + RouteID pairs
const map = {};
data.features.forEach(f => {
    map[f.properties.route_id] = f.properties.name;
});

// Print all unique pairs to I can pick the right ones
console.log(JSON.stringify(map, null, 2));
