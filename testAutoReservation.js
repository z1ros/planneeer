/**
 * Test the Auto-Reservation Flow
 * 
 * This script tests the full Fetch.ai + Playwright integration:
 * 1. ASI:One parses the natural language request
 * 2. Playwright automates the browser to complete the reservation
 * 
 * Run with: node testAutoReservation.js
 */

import { executeAutoReservation, cleanup, getConfigStatus } from './fetchAgent.js';

async function runTest() {
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║  Fetch.ai + Playwright Auto-Reservation Test      ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');

    // Check configuration
    const config = getConfigStatus();
    console.log('📋 Configuration Status:');
    console.log(`   ASI:One API configured: ${config.asi_one_api_configured ? '✅' : '❌'}`);
    console.log(`   API Key preview: ${config.asi_one_api_preview || 'Not set'}`);
    console.log('\n');

    if (!config.asi_one_api_configured) {
        console.error('❌ ASI_ONE_API_KEY is not configured. Please add it to your .env file.');
        process.exit(1);
    }

    // Test request
    const testRequest = "Book a table at Alden and Harlow in Boston for february 3rd at 11:30pm for 2 people";

    // Guest details for completing the reservation
    const guestDetails = {
        phone: '5044273839',
        firstName: 'Test',
        lastName: 'User',
        email: '501jag3@gmail.com'
    };

    console.log('📝 Test Request:');
    console.log(`   "${testRequest}"`);
    console.log(`   📞 Phone: ${guestDetails.phone}`);
    console.log('\n');

    try {
        // Execute the auto-reservation WITH guest details
        const result = await executeAutoReservation(testRequest, guestDetails);

        console.log('\n');
        console.log('╔═══════════════════════════════════════════════════╗');
        console.log('║  RESULT                                           ║');
        console.log('╚═══════════════════════════════════════════════════╝\n');

        if (result.success) {
            console.log('✅ Reservation flow completed successfully!\n');
            console.log('📍 Parsed Intent:');
            console.log(`   Restaurant: ${result.intent?.restaurant}`);
            console.log(`   Location: ${result.intent?.location}`);
            console.log(`   Date: ${result.intent?.date}`);
            console.log(`   Time: ${result.intent?.time}`);
            console.log(`   Party Size: ${result.intent?.partySize}`);
            console.log('\n🌐 Browser Result:');
            console.log(`   URL: ${result.url}`);
            console.log(`   Screenshot: ${result.screenshot}`);
            console.log(`   Message: ${result.message}`);
        } else {
            console.log('❌ Reservation flow failed');
            console.log(`   Error: ${result.error}`);
        }

    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
    } finally {
        // Cleanup browser
        console.log('\n🧹 Cleaning up...');
        await cleanup();
        console.log('✅ Done\n');
    }
}

// Run the test
runTest();
