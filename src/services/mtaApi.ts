
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export interface MTAEntity {
    id: string;
    isDeleted?: boolean;
    tripUpdate?: {
        trip: {
            tripId: string;
            routeId: string;
            startTime: string;
            startDate: string;
            scheduleRelationship?: string;
        };
        stopTimeUpdate: {
            stopSequence?: number;
            stopId: string;
            arrival?: { delay?: number; time: string | number; uncertainty?: number };
            departure?: { delay?: number; time: string | number; uncertainty?: number };
            scheduleRelationship?: string;
        }[];
    };
    vehicle?: {
        trip: {
            tripId: string;
            routeId: string;
            startTime: string;
            startDate: string;
            scheduleRelationship?: string;
        };
        position?: {
            latitude: number;
            longitude: number;
            bearing?: number;
            speed?: number;
        };
        currentStopSequence?: number;
        stopId?: string;
        currentStatus?: string;
        timestamp?: string | number;
        occupancyStatus?: string;
    };
    alert?: any;
}

export interface GtfsFeedMessage {
    header: {
        gtfsRealtimeVersion: string;
        incrementality: string;
        timestamp: string | number;
    };
    entity: MTAEntity[];
}

export async function fetchMTAFeed(line: string): Promise<GtfsFeedMessage | null> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/mta/${line}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch MTA feed for ${line}: ${response.statusText}`);
        }
        const data = await response.json();
        return data as GtfsFeedMessage;
    } catch (error) {
        console.error(`Error fetching MTA feed for ${line}:`, error);
        return null;
    }
}

/**
 * Fetch all configured MTA feeds
 */
export async function fetchAllMTAFeeds(): Promise<Record<string, GtfsFeedMessage>> {
    const feeds = ['ace', 'bdfm', 'g', 'jz', 'nqrw', '1234567'];
    const results: Record<string, GtfsFeedMessage> = {};

    await Promise.all(feeds.map(async (feed) => {
        const data = await fetchMTAFeed(feed);
        if (data) {
            results[feed] = data;
        }
    }));

    return results;
}

/**
 * Line Status for Visualization
     * Logic:
     * - Severe: Explicit Alert with "severe" severity
     * - Delayed: Average delay > 5 minutes
     * - Normal: Everything else
     */
export type LineStatus = 'normal' | 'delayed' | 'severe';

export interface LineStatusMap {
    [routeId: string]: {
        status: LineStatus;
        reason?: string; // e.g. "Signal Problems at West 4th" context
    };
}

export async function fetchLineStatuses(): Promise<LineStatusMap> {
    try {
        const feedData = await fetchAllMTAFeeds();
        const statusMap: LineStatusMap = {};

        // Flatten all entities from all feeds
        const allEntities: MTAEntity[] = Object.values(feedData).flatMap(feed => feed.entity);

        // Group by Route
        const routeData: Record<string, { delays: number[]; alerts: any[] }> = {};

        allEntities.forEach(entity => {
            // Process Trip Updates for Delays
            if (entity.tripUpdate?.trip?.routeId) {
                const routeId = entity.tripUpdate.trip.routeId;
                if (!routeData[routeId]) routeData[routeId] = { delays: [], alerts: [] };

                // Extract delays from stop updates
                if (entity.tripUpdate.stopTimeUpdate) {
                    entity.tripUpdate.stopTimeUpdate.forEach(stu => {
                        const delayArr = stu.arrival?.delay;
                        const delayDep = stu.departure?.delay;
                        if (typeof delayArr === 'number') routeData[routeId].delays.push(delayArr);
                        if (typeof delayDep === 'number') routeData[routeId].delays.push(delayDep);
                    });
                }
            }

            // Process Alerts (Note: Alerts often apply to multiple entities/routes)
            if (entity.alert) {
                entity.alert.informedEntity?.forEach((informed: any) => {
                    if (informed.routeId) {
                        const routeId = informed.routeId;
                        if (!routeData[routeId]) routeData[routeId] = { delays: [], alerts: [] };
                        routeData[routeId].alerts.push(entity.alert);
                    }
                });
            }
        });

        // Determine Status for each route
        Object.keys(routeData).forEach(routeId => {
            const data = routeData[routeId];
            let status: LineStatus = 'normal';
            let reason = '';

            // 1. Check Severe Alerts
            // Note: GTFS-RT alerts structure varies, simplifying for hackathon logic
            const severeAlert = data.alerts.find(a =>
                // Check if severity exists and is high (this might need tuning based on actual feed data)
                // For now, assume presence of specific keywords in headerText indicates severity if parsed differently
                // But normally severity is a field? MTA extensions?
                // Let's rely on keywords in headerText for "Severe" or "Suspended"
                JSON.stringify(a.headerText).toLowerCase().includes('suspended') ||
                JSON.stringify(a.headerText).toLowerCase().includes('severe')
            );

            if (severeAlert) {
                status = 'severe';
                reason = extractText(severeAlert.headerText);
            } else {
                // 2. Check Delays
                if (data.delays.length > 0) {
                    // Average delay in seconds? Usually seconds.
                    const avgDelay = data.delays.reduce((a, b) => a + b, 0) / data.delays.length;
                    const avgDelayMinutes = avgDelay / 60;

                    if (avgDelayMinutes > 5) {
                        status = 'delayed';
                        reason = `Average delay: ${avgDelayMinutes.toFixed(0)} min`;
                    }
                }
            }

            statusMap[routeId] = { status, reason };
        });

        // =========================================================
        // HACKATHON SIMULATION MODE (Inject Fake Stress)
        // =========================================================
        // Force 'L' line (Canarsie = ID "58") to be SEVERE
        // Also map standard "L" just in case
        statusMap['L'] = { status: 'severe', reason: 'Signal Failure at Bedford Av' };
        statusMap['58'] = { status: 'severe', reason: 'Signal Failure at Bedford Av' };

        // Force 'N'/'Q' lines (Broadway = IDs "63", "64", "65") to be DELAYED
        const delayReason = 'Congestion ahead causing delays';
        const delayStatus: { status: 'delayed', reason: string } = { status: 'delayed', reason: delayReason };

        statusMap['N'] = delayStatus;
        statusMap['Q'] = delayStatus;
        statusMap['63'] = delayStatus;
        statusMap['64'] = delayStatus;
        statusMap['65'] = delayStatus;
        // =========================================================

        return statusMap;

    } catch (error) {
        console.error('Error deriving line statuses:', error);
        return {};
    }
}

// Helper to extract text from GTFS-RT translated string
function extractText(translatedString: any): string {
    if (!translatedString) return '';
    if (typeof translatedString === 'string') return translatedString;
    if (translatedString.translation && translatedString.translation.length > 0) {
        return translatedString.translation[0].text;
    }
    return '';
}
