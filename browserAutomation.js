/**
 * Browser Automation Service
 * 
 * Uses Playwright to automate browser interactions for reservation booking.
 * This service is controlled by the Fetch.ai agent integration.
 */

import { chromium } from 'playwright';

// =============================================================================
// CONFIGURATION
// =============================================================================

const BROWSER_CONFIG = {
    headless: false, // Set to true for production, false for demo
    slowMo: 100,     // Slow down actions for visibility during demo
    timeout: 30000   // 30 second timeout for operations
};

// =============================================================================
// BROWSER INSTANCE MANAGEMENT
// =============================================================================

let browserInstance = null;

/**
 * Get or create a browser instance
 * @returns {Promise<Browser>}
 */
async function getBrowser() {
    if (!browserInstance) {
        console.log('[BrowserAutomation] Launching browser...');
        browserInstance = await chromium.launch({
            headless: BROWSER_CONFIG.headless,
            slowMo: BROWSER_CONFIG.slowMo
        });
    }
    return browserInstance;
}

/**
 * Close the browser instance
 */
async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        console.log('[BrowserAutomation] Browser closed');
    }
}

// =============================================================================
// OPENTABLE RESERVATION FUNCTIONS
// =============================================================================

/**
 * Navigate to OpenTable and search for a restaurant with pre-filled parameters
 * @param {Object} page - Playwright page instance
 * @param {string} restaurant - Restaurant name to search
 * @param {string} location - Location/city
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} time - Time in HH:MM format (24hr)
 * @param {number} partySize - Number of guests
 * @returns {Promise<boolean>} - Success status
 */
async function searchRestaurant(page, restaurant, location = 'Boston', date = null, time = null, partySize = 2) {
    console.log(`[BrowserAutomation] Searching for ${restaurant} in ${location}...`);
    console.log(`[BrowserAutomation] With date=${date}, time=${time}, partySize=${partySize}`);

    try {
        // Build OpenTable search URL with query parameters
        const searchTerm = encodeURIComponent(`${restaurant} ${location}`);

        // Convert 24hr time (HH:MM) to OpenTable format (they use HH:MM:SS)
        const formattedTime = time ? `${time}:00` : '19:00:00';

        // Build the URL with all parameters
        let openTableUrl = `https://www.opentable.com/s?term=${searchTerm}`;

        if (date) {
            openTableUrl += `&dateTime=${date}T${formattedTime}`;
        }

        if (partySize) {
            openTableUrl += `&covers=${partySize}`;
        }

        console.log(`[BrowserAutomation] Navigating to: ${openTableUrl}`);

        // Navigate to OpenTable with parameters
        await page.goto(openTableUrl, {
            waitUntil: 'domcontentloaded',
            timeout: BROWSER_CONFIG.timeout
        });

        // Wait for results to load
        await page.waitForTimeout(3000);

        console.log('[BrowserAutomation] Search completed with pre-filled parameters');
        return true;
    } catch (error) {
        console.error('[BrowserAutomation] Search failed:', error.message);
        return false;
    }
}

/**
 * Select date, time, and party size for reservation
 * @param {Object} page - Playwright page instance
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} time - Time in HH:MM format (24hr)
 * @param {number} partySize - Number of guests
 * @returns {Promise<boolean>} - Success status
 */
async function selectReservationDetails(page, date, time, partySize) {
    console.log(`[BrowserAutomation] Setting: ${date} at ${time} for ${partySize} people`);

    try {
        // Try to find and interact with party size selector
        const partySizeSelector = await page.$('select[data-test="party-size-picker"], [data-test="party-size"]');
        if (partySizeSelector) {
            await partySizeSelector.selectOption({ value: partySize.toString() });
        }

        // Try to find and interact with date picker
        const dateInput = await page.$('input[data-test="date-picker"], [data-test="search-date"]');
        if (dateInput) {
            await dateInput.click();
            // Date picker interaction varies by site version
            await page.waitForTimeout(1000);
        }

        // Try to find and interact with time picker
        const timeSelector = await page.$('select[data-test="time-picker"], [data-test="search-time"]');
        if (timeSelector) {
            await timeSelector.selectOption({ label: time });
        }

        console.log('[BrowserAutomation] Reservation details set');
        return true;
    } catch (error) {
        console.error('[BrowserAutomation] Failed to set details:', error.message);
        return false;
    }
}

/**
 * Click on a restaurant from search results
 * @param {Object} page - Playwright page instance
 * @param {string} restaurantName - Name of the restaurant to select
 * @returns {Promise<boolean>} - Success status
 */
async function selectRestaurantFromResults(page, restaurantName) {
    console.log(`[BrowserAutomation] Looking for ${restaurantName} in results...`);

    try {
        // Wait for results to load
        await page.waitForTimeout(2000);

        // Try to find the restaurant link
        const restaurantLink = await page.$(`a:has-text("${restaurantName}")`);

        if (restaurantLink) {
            await restaurantLink.click();
            await page.waitForLoadState('domcontentloaded');
            console.log('[BrowserAutomation] Restaurant page loaded');
            return true;
        } else {
            // Click on first result if exact match not found
            const firstResult = await page.$('[data-test="search-result-item"] a, .search-results a');
            if (firstResult) {
                await firstResult.click();
                await page.waitForLoadState('domcontentloaded');
                console.log('[BrowserAutomation] First result selected');
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('[BrowserAutomation] Failed to select restaurant:', error.message);
        return false;
    }
}

/**
 * Find and click an available time slot
 * @param {Object} page - Playwright page instance
 * @param {string} preferredTime - Preferred time (HH:MM format)
 * @returns {Promise<string|null>} - Selected time slot or null
 */
async function selectTimeSlot(page, preferredTime) {
    console.log(`[BrowserAutomation] Looking for time slot near ${preferredTime}...`);

    try {
        // Wait for time slots to appear
        await page.waitForTimeout(2000);

        // Try to find time slot buttons
        const timeSlots = await page.$$('[data-test="time-slot"], button[data-time], .timeslot');

        if (timeSlots.length > 0) {
            // Click the first available slot
            await timeSlots[0].click();
            console.log('[BrowserAutomation] Time slot selected');
            return preferredTime;
        }

        // Alternative: look for any clickable time
        const anyTimeButton = await page.$('button:has-text(":"), a:has-text("PM"), a:has-text("AM")');
        if (anyTimeButton) {
            await anyTimeButton.click();
            return preferredTime;
        }

        return null;
    } catch (error) {
        console.error('[BrowserAutomation] Failed to select time slot:', error.message);
        return null;
    }
}

/**
 * Fill in guest details on the reservation form
 * @param {Object} page - Playwright page instance
 * @param {Object} guestDetails - Guest contact information
 * @returns {Promise<boolean>} - Success status
 */
async function fillGuestDetails(page, guestDetails) {
    const { phone, firstName, lastName, email } = guestDetails;
    console.log(`[BrowserAutomation] Filling guest details...`);
    console.log(`  Phone: ${phone}`);

    try {
        // Wait for the reservation form to load
        await page.waitForTimeout(2000);

        // Try to find and fill phone number field
        const phoneSelectors = [
            'input[name="phone"]',
            'input[type="tel"]',
            'input[data-test="phone-input"]',
            'input[placeholder*="phone" i]',
            'input[placeholder*="Phone" i]',
            'input[id*="phone" i]',
            '#phone',
            '[data-test="phoneNumber"]'
        ];

        for (const selector of phoneSelectors) {
            const phoneInput = await page.$(selector);
            if (phoneInput) {
                await phoneInput.click();
                await phoneInput.fill(phone);
                console.log(`[BrowserAutomation] Phone filled using: ${selector}`);
                break;
            }
        }

        // Try to fill first name if provided
        if (firstName) {
            const firstNameSelectors = ['input[name="firstName"]', 'input[data-test="first-name"]', '#firstName'];
            for (const selector of firstNameSelectors) {
                const input = await page.$(selector);
                if (input) {
                    await input.fill(firstName);
                    console.log('[BrowserAutomation] First name filled');
                    break;
                }
            }
        }

        // Try to fill last name if provided
        if (lastName) {
            const lastNameSelectors = ['input[name="lastName"]', 'input[data-test="last-name"]', '#lastName'];
            for (const selector of lastNameSelectors) {
                const input = await page.$(selector);
                if (input) {
                    await input.fill(lastName);
                    console.log('[BrowserAutomation] Last name filled');
                    break;
                }
            }
        }

        // Try to fill email if provided
        if (email) {
            const emailSelectors = ['input[name="email"]', 'input[type="email"]', 'input[data-test="email-input"]', '#email'];
            for (const selector of emailSelectors) {
                const input = await page.$(selector);
                if (input) {
                    await input.fill(email);
                    console.log('[BrowserAutomation] Email filled');
                    break;
                }
            }
        }

        console.log('[BrowserAutomation] Guest details filled');
        return true;
    } catch (error) {
        console.error('[BrowserAutomation] Failed to fill guest details:', error.message);
        return false;
    }
}

/**
 * Click the confirm/complete reservation button
 * @param {Object} page - Playwright page instance
 * @returns {Promise<boolean>} - Success status
 */
async function confirmReservation(page) {
    console.log('[BrowserAutomation] Looking for confirm button...');

    try {
        // Wait a moment for the page to be ready
        await page.waitForTimeout(1000);

        // Various confirm button selectors OpenTable might use
        const confirmSelectors = [
            'button[data-test="complete-reservation"]',
            'button[data-test="confirm-reservation"]',
            'button:has-text("Complete reservation")',
            'button:has-text("Complete Reservation")',
            'button:has-text("Confirm")',
            'button:has-text("Reserve")',
            'button[type="submit"]:has-text("Complete")',
            'input[type="submit"][value*="Complete"]',
            '[data-test="reservation-button"]',
            '.reservation-button',
            'button.complete-button'
        ];

        for (const selector of confirmSelectors) {
            const confirmButton = await page.$(selector);
            if (confirmButton) {
                console.log(`[BrowserAutomation] Found confirm button: ${selector}`);
                await confirmButton.click();
                console.log('[BrowserAutomation] Clicked confirm button!');

                // Wait for confirmation page to load
                await page.waitForTimeout(3000);
                return true;
            }
        }

        console.log('[BrowserAutomation] No confirm button found - may need to scroll or form not complete');
        return false;
    } catch (error) {
        console.error('[BrowserAutomation] Failed to confirm reservation:', error.message);
        return false;
    }
}

/**
 * Take a screenshot for confirmation
 * @param {Object} page - Playwright page instance
 * @param {string} filename - Screenshot filename
 * @returns {Promise<string>} - Path to screenshot
 */
async function captureScreenshot(page, filename = 'reservation_confirmation.png') {
    const screenshotPath = `./${filename}`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[BrowserAutomation] Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
}

/**
 * Get the current page URL
 * @param {Object} page - Playwright page instance
 * @returns {string} - Current URL
 */
function getCurrentUrl(page) {
    return page.url();
}

/**
 * Check if OpenTable is requesting a verification code
 * @param {Object} page - Playwright page instance
 * @returns {Promise<boolean>} - True if verification code input is detected
 */
async function checkForVerificationCode(page) {
    console.log('[BrowserAutomation] Checking for verification code request...');

    try {
        // Various selectors that OpenTable might use for verification code input
        const verificationSelectors = [
            'input[name="code"]',
            'input[placeholder*="code" i]',
            'input[placeholder*="verification" i]',
            'input[data-test*="code" i]',
            'input[data-test*="verification" i]',
            'input[type="tel"][maxlength="6"]',
            'input[type="tel"][maxlength="4"]',
            'input[aria-label*="code" i]',
            'input[aria-label*="verification" i]',
            '[data-test="otp-input"]',
            '.verification-code-input',
            'input[name="otp"]'
        ];

        // Also check for text indicating verification is needed
        const verificationTextSelectors = [
            'text=Enter the code',
            'text=verification code',
            'text=Verify your phone',
            'text=We sent you a code',
            'text=Enter code',
            'text=SMS code'
        ];

        // Check for input fields
        for (const selector of verificationSelectors) {
            const element = await page.$(selector);
            if (element) {
                const isVisible = await element.isVisible();
                if (isVisible) {
                    console.log(`[BrowserAutomation] Found verification input: ${selector}`);
                    return true;
                }
            }
        }

        // Check for verification text
        for (const selector of verificationTextSelectors) {
            const element = await page.$(selector);
            if (element) {
                const isVisible = await element.isVisible();
                if (isVisible) {
                    console.log(`[BrowserAutomation] Found verification text: ${selector}`);
                    return true;
                }
            }
        }

        return false;
    } catch (error) {
        console.log('[BrowserAutomation] Error checking for verification:', error.message);
        return false;
    }
}

// =============================================================================
// MAIN RESERVATION FLOW
// =============================================================================

/**
 * Execute the full reservation flow including guest details and confirmation
 * @param {Object} reservationDetails - Reservation details from AI parsing
 * @param {Object} guestDetails - Optional guest contact info (phone, firstName, lastName, email)
 * @returns {Promise<Object>} - Result with status, url, and screenshot
 */
async function executeReservation(reservationDetails, guestDetails = null) {
    const { restaurant, location, date, time, partySize } = reservationDetails;

    console.log('[BrowserAutomation] Starting FULL reservation flow...');
    console.log(`  Restaurant: ${restaurant}`);
    console.log(`  Location: ${location || 'Boston'}`);
    console.log(`  Date: ${date}`);
    console.log(`  Time: ${time}`);
    console.log(`  Party Size: ${partySize}`);
    if (guestDetails) {
        console.log(`  Phone: ${guestDetails.phone}`);
    }

    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Step 1: Search for the restaurant WITH date/time/partySize in URL
        console.log('\n[Step 1] Searching for restaurant...');
        const searchSuccess = await searchRestaurant(page, restaurant, location || 'Boston', date, time, partySize);
        if (!searchSuccess) {
            throw new Error('Failed to search for restaurant');
        }

        // Step 2: Select restaurant from results
        console.log('\n[Step 2] Selecting restaurant from results...');
        const selectSuccess = await selectRestaurantFromResults(page, restaurant);
        if (!selectSuccess) {
            console.log('[BrowserAutomation] Could not find exact restaurant, continuing with search page');
        }

        // Step 3: Set reservation details (if needed)
        console.log('\n[Step 3] Setting reservation details...');
        await selectReservationDetails(page, date, time, partySize);

        // Step 4: Try to select a time slot
        console.log('\n[Step 4] Selecting time slot...');
        await selectTimeSlot(page, time);

        // Step 5: Fill guest details if provided
        let guestDetailsFilled = false;
        if (guestDetails && guestDetails.phone) {
            console.log('\n[Step 5] Filling guest details...');
            guestDetailsFilled = await fillGuestDetails(page, guestDetails);
        }

        // Step 6: Attempt to confirm the reservation
        let confirmationSuccess = false;
        if (guestDetailsFilled) {
            console.log('\n[Step 6] Confirming reservation...');
            confirmationSuccess = await confirmReservation(page);
        }

        // Step 7: Capture screenshot and URL (final state)
        console.log('\n[Step 7] Capturing confirmation...');
        const screenshotPath = await captureScreenshot(page, `reservation_${Date.now()}.png`);
        const currentUrl = getCurrentUrl(page);

        console.log('[BrowserAutomation] Reservation flow completed');

        // Check if verification code is needed
        const needsVerification = await checkForVerificationCode(page);

        if (needsVerification) {
            console.log('[BrowserAutomation] ⚠️ Verification code required - keeping browser open!');
            console.log('[BrowserAutomation] Please enter the code sent to your phone.');

            // Capture screenshot showing verification page
            const verificationScreenshot = await captureScreenshot(page, `verification_${Date.now()}.png`);

            return {
                success: true,
                status: 'verification_needed',
                needsVerification: true,
                browserOpen: true, // Browser stays open!
                url: getCurrentUrl(page),
                screenshot: verificationScreenshot,
                message: `📱 Verification code required! The browser is staying open. Please check your phone for the SMS code from OpenTable and enter it in the browser. Once verified, your reservation will be confirmed.`,
                // Store context reference so we can close it later if needed
                _context: context,
                _page: page
            };
        }

        // Determine status based on what was accomplished
        let status, message;
        if (confirmationSuccess) {
            status = 'reservation_completed';
            message = `Reservation completed for ${restaurant}! Check the link below for details.`;
        } else if (guestDetailsFilled) {
            status = 'guest_details_filled';
            message = `Guest details filled for ${restaurant}. Please confirm manually using the link below.`;
        } else {
            status = 'reservation_page_reached';
            message = `Navigated to reservation page for ${restaurant}. Complete your booking using the link below.`;
        }

        // Close context since no verification needed
        await context.close();

        return {
            success: true,
            status: status,
            confirmationSuccess: confirmationSuccess,
            guestDetailsFilled: guestDetailsFilled,
            url: currentUrl,
            screenshot: screenshotPath,
            message: message,
            browserOpen: false
        };

    } catch (error) {
        console.error('[BrowserAutomation] Reservation flow failed:', error.message);

        // Capture error state screenshot
        const errorScreenshot = await captureScreenshot(page, `error_${Date.now()}.png`);
        const errorUrl = getCurrentUrl(page);

        // Close context on error
        await context.close();

        return {
            success: false,
            status: 'failed',
            error: error.message,
            screenshot: errorScreenshot,
            url: errorUrl,
            browserOpen: false
        };
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
    // Main functions
    executeReservation,

    // Individual steps (for custom flows)
    searchRestaurant,
    selectReservationDetails,
    selectRestaurantFromResults,
    selectTimeSlot,
    fillGuestDetails,
    confirmReservation,
    captureScreenshot,
    checkForVerificationCode,

    // Browser management
    getBrowser,
    closeBrowser,
    getCurrentUrl,

    // Config
    BROWSER_CONFIG
};
