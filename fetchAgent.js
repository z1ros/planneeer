/**
 * Fetch.ai Agent Integration Service
 * 
 * This module handles communication with the Fetch.ai Agentverse
 * reservation agent for automatic booking of itinerary events.
 * 
 * It uses ASI:One API for natural language understanding and
 * Playwright for browser automation to complete bookings.
 */

import dotenv from 'dotenv';
dotenv.config();

// Import browser automation
import { executeReservation, closeBrowser } from './browserAutomation.js';

// ===========================================
// CONFIGURATION
// ===========================================

const FETCHAI_API_KEY = process.env.FETCHAI_API_KEY;
const ASI_ONE_API_KEY = process.env.ASI_ONE_API_KEY;
const RESERVATION_AGENT_ADDRESS = 'agent1qdf8d8yfx609lgzxptrhk52hth49ljed6c0ymsvdeu2cycfpx24dvfem350';

// API endpoints
const AGENTVERSE_API_BASE = 'https://agentverse.ai/v1';
const DELTAV_API_BASE = 'https://deltav.agentverse.ai/v1';
const ASI_ONE_API = 'https://api.asi1.ai/v1/chat/completions';

// ===========================================
// MESSAGE MODELS
// ===========================================

/**
 * Format an itinerary event into a reservation request
 * @param {Object} event - The itinerary event from MongoDB
 * @returns {Object} - Formatted reservation request
 */
function formatReservationRequest(event) {
    return {
        // Core reservation details
        venue_name: event.name || event.title,
        venue_type: event.type || 'restaurant', // restaurant, hotel, activity, etc.
        venue_address: event.address || event.location,

        // Timing
        date: event.date || event.startDate,
        time: event.time || event.startTime,
        duration_minutes: event.duration || 60,

        // Party details
        party_size: event.partySize || event.guests || 2,

        // Contact info (to be filled by user/frontend)
        contact_name: event.contactName || '',
        contact_phone: event.contactPhone || '',
        contact_email: event.contactEmail || '',

        // Special requests
        special_requests: event.notes || event.specialRequests || '',

        // Metadata
        event_id: event._id?.toString() || event.id,
        itinerary_id: event.itineraryId
    };
}

// ===========================================
// AGENT COMMUNICATION
// ===========================================

/**
 * Send a reservation request to the Fetch.ai agent
 * @param {Object} reservationData - Formatted reservation request
 * @returns {Promise<Object>} - Agent response with booking confirmation or error
 */
async function sendReservationRequest(reservationData) {
    if (!FETCHAI_API_KEY) {
        throw new Error('FETCHAI_API_KEY is not configured in environment variables');
    }

    try {
        // Prepare the message payload for the agent
        const payload = {
            target_agent: RESERVATION_AGENT_ADDRESS,
            message: {
                type: 'reservation_request',
                data: reservationData
            }
        };

        console.log('[FetchAgent] Sending reservation request:', JSON.stringify(payload, null, 2));

        // Send request via Agentverse API
        const response = await fetch(`${AGENTVERSE_API_BASE}/agents/communicate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${FETCHAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Agentverse API error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        console.log('[FetchAgent] Received response:', JSON.stringify(result, null, 2));

        return {
            success: true,
            booking_id: result.booking_id || result.confirmation_id,
            status: result.status || 'pending',
            message: result.message || 'Reservation request submitted',
            raw_response: result
        };

    } catch (error) {
        console.error('[FetchAgent] Error communicating with agent:', error);
        return {
            success: false,
            error: error.message,
            status: 'failed'
        };
    }
}

/**
 * Alternative: Use DeltaV API for natural language reservation requests
 * This allows more flexible, conversational booking requests
 * @param {string} naturalLanguageRequest - Natural language booking request
 * @returns {Promise<Object>} - DeltaV response
 */
async function sendDeltaVRequest(naturalLanguageRequest) {
    if (!FETCHAI_API_KEY) {
        throw new Error('FETCHAI_API_KEY is not configured in environment variables');
    }

    try {
        const payload = {
            message: naturalLanguageRequest,
            session_id: `session_${Date.now()}`, // Unique session ID
            agent_address: RESERVATION_AGENT_ADDRESS
        };

        console.log('[FetchAgent] Sending DeltaV request:', naturalLanguageRequest);

        const response = await fetch(`${DELTAV_API_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${FETCHAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeltaV API error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        console.log('[FetchAgent] DeltaV response:', JSON.stringify(result, null, 2));

        return {
            success: true,
            response: result.response || result.message,
            session_id: result.session_id,
            raw_response: result
        };

    } catch (error) {
        console.error('[FetchAgent] DeltaV error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ===========================================
// HIGH-LEVEL BOOKING FUNCTIONS
// ===========================================

/**
 * Book a reservation for an itinerary event
 * @param {Object} event - The itinerary event object from MongoDB
 * @returns {Promise<Object>} - Booking result
 */
async function bookReservation(event) {
    const reservationData = formatReservationRequest(event);
    return await sendReservationRequest(reservationData);
}

/**
 * Book multiple reservations for an entire itinerary
 * @param {Array} events - Array of itinerary events
 * @returns {Promise<Array>} - Array of booking results
 */
async function bookMultipleReservations(events) {
    console.log(`[FetchAgent] Processing ${events.length} reservations...`);

    const results = [];

    for (const event of events) {
        // Only attempt to book reservable event types
        const reservableTypes = ['restaurant', 'dining', 'hotel', 'activity', 'tour', 'show', 'event'];
        const eventType = (event.type || event.category || '').toLowerCase();

        if (reservableTypes.some(type => eventType.includes(type))) {
            const result = await bookReservation(event);
            results.push({
                event_id: event._id?.toString() || event.id,
                event_name: event.name || event.title,
                ...result
            });

            // Add a small delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        } else {
            results.push({
                event_id: event._id?.toString() || event.id,
                event_name: event.name || event.title,
                success: false,
                status: 'skipped',
                message: `Event type '${eventType}' is not reservable`
            });
        }
    }

    console.log(`[FetchAgent] Completed processing. Success: ${results.filter(r => r.success).length}/${results.length}`);
    return results;
}

/**
 * Create a natural language reservation request from event data
 * @param {Object} event - The itinerary event
 * @returns {string} - Natural language request for DeltaV
 */
function createNaturalLanguageRequest(event) {
    const venueName = event.name || event.title;
    const date = event.date || event.startDate;
    const time = event.time || event.startTime;
    const partySize = event.partySize || event.guests || 2;

    return `I would like to make a reservation at ${venueName} for ${partySize} people on ${date} at ${time}. Please confirm the booking.`;
}

/**
 * Book using natural language via DeltaV
 * @param {Object} event - The itinerary event
 * @returns {Promise<Object>} - Booking result
 */
async function bookWithDeltaV(event) {
    const request = createNaturalLanguageRequest(event);
    return await sendDeltaVRequest(request);
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

/**
 * Check if the Fetch.ai agent is available
 * @returns {Promise<boolean>} - True if agent is reachable
 */
async function checkAgentStatus() {
    try {
        const response = await fetch(`${AGENTVERSE_API_BASE}/agents/${RESERVATION_AGENT_ADDRESS}/status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${FETCHAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.ok;
    } catch (error) {
        console.error('[FetchAgent] Agent status check failed:', error);
        return false;
    }
}

/**
 * Get the configuration status for debugging
 * @returns {Object} - Configuration status
 */
function getConfigStatus() {
    return {
        fetchai_api_configured: !!FETCHAI_API_KEY,
        asi_one_api_configured: !!ASI_ONE_API_KEY,
        asi_one_api_preview: ASI_ONE_API_KEY ? `${ASI_ONE_API_KEY.substring(0, 15)}...` : null,
        agent_address: RESERVATION_AGENT_ADDRESS,
        agentverse_api: AGENTVERSE_API_BASE,
        asi_one_api: ASI_ONE_API
    };
}

// ===========================================
// ASI:ONE INTENT PARSING (FETCH.AI INTEGRATION)
// ===========================================

/**
 * Parse natural language reservation request using Fetch.ai ASI:One
 * This uses the agentic LLM to understand and extract reservation details
 * @param {string} userMessage - Natural language reservation request
 * @returns {Promise<Object>} - Parsed reservation details
 */
async function parseReservationIntent(userMessage) {
    if (!ASI_ONE_API_KEY) {
        throw new Error('ASI_ONE_API_KEY is not configured in environment variables');
    }

    console.log('[FetchAgent] Parsing reservation intent via ASI:One...');
    console.log('[FetchAgent] User message:', userMessage);

    const sessionId = `parse_${Date.now()}`;

    const systemPrompt = `You are a reservation assistant. Extract reservation details from the user's message and respond ONLY with a valid JSON object (no markdown, no explanation).

The JSON must have these fields:
{
    "restaurant": "name of the restaurant",
    "location": "city or area",
    "date": "YYYY-MM-DD format (use tomorrow's date if they say 'tomorrow')",
    "time": "HH:MM format in 24hr (e.g., 18:00 for 6pm)",
    "partySize": number of people (default 2 if not specified)
}

Today's date is ${new Date().toISOString().split('T')[0]}.
Tomorrow's date is ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}.`;

    try {
        const response = await fetch(ASI_ONE_API, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ASI_ONE_API_KEY}`,
                'Content-Type': 'application/json',
                'x-session-id': sessionId
            },
            body: JSON.stringify({
                model: 'asi1',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ASI:One API error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content || '';

        console.log('[FetchAgent] ASI:One raw response:', content);

        // Parse the JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('[FetchAgent] Parsed intent:', parsed);
            return {
                success: true,
                ...parsed
            };
        } else {
            throw new Error('Could not parse JSON from ASI:One response');
        }

    } catch (error) {
        console.error('[FetchAgent] Intent parsing failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ===========================================
// BROWSER AUTOMATION ORCHESTRATION
// ===========================================

/**
 * Execute a full reservation using ASI:One + Playwright
 * This is the main orchestration function that:
 * 1. Uses Fetch.ai ASI:One to parse the user's intent
 * 2. Calls Playwright to automate the browser
 * 3. Fills in guest details and confirms reservation
 * 
 * @param {string} userMessage - Natural language reservation request
 * @param {Object} guestDetails - Optional guest info: { phone, firstName, lastName, email }
 * @returns {Promise<Object>} - Reservation result
 */
async function executeAutoReservation(userMessage, guestDetails = null) {
    console.log('===========================================');
    console.log('[FetchAgent] Starting Auto-Reservation Flow');
    console.log('===========================================');

    try {
        // Step 1: Parse intent using Fetch.ai ASI:One
        console.log('\n[Step 1] Parsing intent via Fetch.ai ASI:One...');
        const intent = await parseReservationIntent(userMessage);

        if (!intent.success) {
            throw new Error(`Failed to parse intent: ${intent.error}`);
        }

        console.log('[Step 1] Intent parsed successfully:');
        console.log(`  Restaurant: ${intent.restaurant}`);
        console.log(`  Location: ${intent.location}`);
        console.log(`  Date: ${intent.date}`);
        console.log(`  Time: ${intent.time}`);
        console.log(`  Party Size: ${intent.partySize}`);
        if (guestDetails) {
            console.log(`  Phone: ${guestDetails.phone}`);
        }

        // Step 2: Execute browser automation WITH guest details
        console.log('\n[Step 2] Executing browser automation...');
        const browserResult = await executeReservation({
            restaurant: intent.restaurant,
            location: intent.location,
            date: intent.date,
            time: intent.time,
            partySize: intent.partySize
        }, guestDetails);

        console.log('\n[Step 3] Reservation flow completed');
        console.log('===========================================\n');

        return {
            success: browserResult.success,
            intent: intent,
            browserResult: browserResult,
            url: browserResult.url,
            screenshot: browserResult.screenshot,
            message: browserResult.message,
            confirmationSuccess: browserResult.confirmationSuccess,
            guestDetailsFilled: browserResult.guestDetailsFilled
        };

    } catch (error) {
        console.error('[FetchAgent] Auto-reservation failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Cleanup function to close browser when done
 */
async function cleanup() {
    await closeBrowser();
}

// ===========================================
// EXPORTS
// ===========================================

export {
    // NEW: Main orchestration function (Fetch.ai + Playwright)
    executeAutoReservation,
    parseReservationIntent,
    cleanup,

    // Original booking functions
    bookReservation,
    bookMultipleReservations,
    bookWithDeltaV,

    // Lower-level functions
    sendReservationRequest,
    sendDeltaVRequest,
    formatReservationRequest,
    createNaturalLanguageRequest,

    // Utility functions
    checkAgentStatus,
    getConfigStatus,

    // Constants (for testing/debugging)
    RESERVATION_AGENT_ADDRESS
};
