
const fs = require('fs');
const path = require('path');

// Read the CURRENT file which has the right properties but wrong coordinates
const INPUT_PATH = path.join(__dirname, '../src/data/nycSubwayRoutes.json');
const OUTPUT_PATH = path.join(__dirname, '../src/data/nycSubwayRoutes_final.json');

// EPSG:3857 (Web Mercator) to EPSG:4326 (WGS84 Lat/Lon) conversion
function toWGS84(x, y) {
    const R = 6378137; // Earth radius
    const lat = (Math.PI / 2 - 2 * Math.atan(Math.exp(-y / R))) * (180 / Math.PI);
    const lon = (x / R) * (180 / Math.PI);
    return [lon, lat];
}

function reproject() {
    console.log('Reading data from:', INPUT_PATH);
    if (!fs.existsSync(INPUT_PATH)) {
        console.error('File not found:', INPUT_PATH);
        process.exit(1);
    }
    const rawData = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

    console.log(`Processing ${rawData.features.length} features...`);

    const processedFeatures = rawData.features.map(f => {
        // Keep existing Normalized properties
        const properties = f.properties;

        // Reproject geometry
        const geometry = f.geometry;
        let newCoordinates = [];

        // Coordinate values in Web Mercator are typically large (> 1000000)
        // Coords in WGS84 are typically small (< 180)
        // We can add a check to avoid double-reprojection if run multiple times
        const sampleVal = geometry.coordinates[0][0];
        const isWebMercator = Math.abs(Array.isArray(sampleVal) ? sampleVal[0] : sampleVal) > 200;

        if (!isWebMercator) {
            return f; // Already WGS84?
        }

        if (geometry.type === 'LineString') {
            newCoordinates = geometry.coordinates.map(coord => toWGS84(coord[0], coord[1]));
        } else if (geometry.type === 'MultiLineString') {
            newCoordinates = geometry.coordinates.map(line => line.map(coord => toWGS84(coord[0], coord[1])));
        }

        return {
            type: 'Feature',
            properties: properties,
            geometry: {
                ...geometry,
                coordinates: newCoordinates
            }
        };
    });

    const finalJson = {
        type: 'FeatureCollection',
        features: processedFeatures
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalJson, null, 2));
    console.log(`Written reprojected data to ${OUTPUT_PATH}`);
}

reproject();
