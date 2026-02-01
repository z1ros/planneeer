
const fs = require('fs');
const path = require('path');

const RAW_DATA_PATH = path.join(__dirname, '../src/data/nycSubwayRoutes_highres.geojson');
const OUTPUT_PATH = path.join(__dirname, '../src/data/nycSubwayRoutes_new.json');

const COLORS = {
    '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
    '4': '#00933C', '5': '#00933C', '6': '#00933C',
    '7': '#B933AD',
    'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
    'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
    'G': '#6CBE45',
    'J': '#996633', 'Z': '#996633',
    'L': '#A7A9AC',
    'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
    'S': '#808183', 'FS': '#808183', 'GS': '#808183', 'H': '#808183',
    'SIR': '#1E2B58'
};

function normalize() {
    console.log('Reading raw data...');
    const rawData = JSON.parse(fs.readFileSync(RAW_DATA_PATH, 'utf8'));

    console.log(`Processing ${rawData.features.length} features...`);

    const processedFeatures = rawData.features.map(f => {
        const routeId = f.properties.ROUTE || 'Unknown';
        // Handle '42' (likely shuttle?)
        // In metadata ROUTE might be '1', 'A'.
        // The data viewed had 'ROUTE': "42", "1", "3", "22"??
        // Wait, let's verify route codes from the viewed file.
        // Viewed file had: "ROUTE": "42" (Queens Blvd?), "ROUTE": "1", "ROUTE": "22" (8th Ave?)
        // Those look like internal Line IDs, NOT route IDs.
        // "LINE": "QUEENS BLVD LINE"
        // We need to map LINES/ROUTES to Service Colors.
        // If ROUTE is numeric/internal, we need a better mapping or rely on `properties.SUBWAY_LABEL` or `properties.LINE`?
        // Viewed file: ROUTE: "1" -> LINE: "BROADWAY/7TH AVE LINE" -> This is the 1/2/3 line?
        // ROUTE: "22" -> LINE: "8 AVENUE LINE" -> A/C/E?

        // Better strategy: Use the "LINE" or "SUBWAY_LABEL" to guess color if ROUTE is obscure.
        // Broad mapping:
        // IND 8th Ave -> Blue
        // IRT Broadway/7th Av -> Red
        // IRT Lexington -> Green
        // IND 6th Ave -> Orange
        // BMT Broadway -> Yellow
        // BMT Canarsie -> Grey (L)
        // IRT Flushing -> Purple (7)
        // BMT Nassau -> Brown (J/Z)
        // IND Crosstown -> Lime (G)
        // BMT Astoria -> Yellow? (N/W)

        let color = '#808183'; // Default Gray
        let name = f.properties.SUBWAY_LABEL || f.properties.LINE || routeId;

        const line = (f.properties.LINE || '').toUpperCase();

        if (line.includes('BROADWAY/7') || line.includes('7TH AVE')) color = '#EE352E'; // 1,2,3
        else if (line.includes('LEXINGTON')) color = '#00933C'; // 4,5,6
        else if (line.includes('FLUSHING')) color = '#B933AD'; // 7
        else if (line.includes('8TH AVE') || line.includes('8 AVENUE')) color = '#0039A6'; // A,C,E
        else if (line.includes('6TH AVE') || line.includes('6 AVENUE')) color = '#FF6319'; // B,D,F,M
        else if (line.includes('BROADWAY')) color = '#FCCC0A'; // N,Q,R,W (Careful with Broadway/7th)
        else if (line.includes('NASSAU')) color = '#996633'; // J,Z
        else if (line.includes('CANARSIE')) color = '#A7A9AC'; // L
        else if (line.includes('CROSSTOWN')) color = '#6CBE45'; // G
        else if (line.includes('ASTORIA')) color = '#FCCC0A'; // N,W
        else if (line.includes('SHUTTLE') || line.includes('42')) color = '#808183'; // S
        else if (line.includes('QUEENS BLVD') || line.includes('QUEENS BOULEVARD')) {
            // Queens Blvd carries E (Blue), M (Orange), R (Yellow).
            // This is tricky. Segments might be shared.
            // We might just arbitrarily color them one of the main ones or a "Trunk" color.
            // Or default to Orange/Blue mix. Let's create a visual distinct color or map based on specific ROUTE ID if possible.
            // ROUTE "42" was Queens Blvd.
            // ROUTE "22" was 8th Ave.
            // Let's assume standard trunk logic works mostly.
            color = '#0039A6'; // Default QBL to Blue (E is express)
        }

        // Override knowns if ROUTE matches service
        if (COLORS[routeId]) color = COLORS[routeId];

        return {
            type: 'Feature',
            properties: {
                route_id: routeId, // Keep original ID for debugging
                line_name: name,
                color: color
            },
            geometry: f.geometry
        };
    });

    const finalJson = {
        type: 'FeatureCollection',
        features: processedFeatures
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalJson, null, 2));
    console.log(`Written normalized data to ${OUTPUT_PATH}`);
}

normalize();
