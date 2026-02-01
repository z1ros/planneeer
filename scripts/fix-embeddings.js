/**
 * Fix Embeddings Script
 * Removes invalid (4-dim) embeddings so vectorize-nyc.js can regenerate proper 768-dim ones
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function fixEmbeddings() {
    const client = new MongoClient(process.env.MONGODB_URI);
    
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        
        const db = client.db('nyc');
        
        console.log('\nRemoving invalid embeddings (4-dim instead of 768-dim)...\n');
        
        // Remove bad embeddings from restaurants
        const r1 = await db.collection('restaurants').updateMany(
            {}, 
            { $unset: { embedding: '' } }
        );
        console.log(`Restaurants: removed ${r1.modifiedCount} embeddings`);
        
        // Remove bad embeddings from events
        const r2 = await db.collection('events_v2').updateMany(
            {}, 
            { $unset: { embedding: '' } }
        );
        console.log(`Events: removed ${r2.modifiedCount} embeddings`);
        
        // Remove bad embeddings from landmarks
        const r3 = await db.collection('landmarks').updateMany(
            {}, 
            { $unset: { embedding: '' } }
        );
        console.log(`Landmarks: removed ${r3.modifiedCount} embeddings`);
        
        console.log('\n✓ Done! Now run: node scripts/vectorize-nyc.js');
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

fixEmbeddings();
