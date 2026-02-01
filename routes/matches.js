import express from 'express';
import { ObjectId } from 'mongodb';

const MASTER_USER_ID = '000000000000000000000000';
const DEFAULT_LIMIT = 5;

function isValidObjectId(value) {
    return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
}

function uniqueArray(values) {
    return Array.from(new Set(values));
}

function computeSharedTags(viewerTags, candidateTags) {
    const viewerSet = new Set(viewerTags);
    const shared = [];

    for (const tag of candidateTags) {
        if (viewerSet.has(tag)) {
            shared.push(tag);
        }
    }

    return uniqueArray(shared);
}

function computeJaccard(viewerTags, candidateTags, sharedCount) {
    const union = new Set([...viewerTags, ...candidateTags]);
    if (union.size === 0) return 0;
    return sharedCount / union.size;
}

function scoreCandidate(viewer, candidate) {
    const viewerTags = Array.isArray(viewer.interestOptions) ? viewer.interestOptions : [];
    const candidateTags = Array.isArray(candidate.interestOptions) ? candidate.interestOptions : [];

    const sharedTags = computeSharedTags(viewerTags, candidateTags);
    const sharedCount = sharedTags.length;
    const jaccard = computeJaccard(viewerTags, candidateTags, sharedCount);
    const ageDiff = Math.abs((viewer.age || 0) - (candidate.age || 0));

    return {
        sharedTags,
        sharedCount,
        jaccard,
        ageDiff
    };
}

function parseLimit(value) {
    if (value === undefined || value === null) return DEFAULT_LIMIT;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_LIMIT;
    return parsed;
}

function sanitizeUser(user) {
    if (!user) return null;
    return {
        name: user.name,
        age: user.age,
        hometown: user.hometown,
        interestOptions: Array.isArray(user.interestOptions) ? user.interestOptions : [],
        interestFreeText: user.interestFreeText,
        description: user.description,
        photoUrl: user.photoUrl,
        instagram: user.instagram
    };
}

function buildMatchResponse(candidate, score) {
    return {
        user: sanitizeUser(candidate),
        sharedTags: score.sharedTags,
        sharedCount: score.sharedCount,
        ageDiff: score.ageDiff
    };
}

export function createMatchesRouter(db) {
    const router = express.Router();
    const usersCollection = db.collection('users');

    // Seed test users
    router.post('/seed-users', async (req, res) => {
        try {
            const testUsers = [
                {
                    _id: new ObjectId(MASTER_USER_ID),
                    name: 'Alex',
                    age: 28,
                    hometown: 'New York, NY',
                    interestOptions: ['hiking', 'photography', 'coffee', 'museums', 'food tours'],
                    description: 'Love exploring new cities and finding hidden gems!',
                    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=faces&q=80',
                    instagram: 'alex_travels'
                },
                {
                    _id: new ObjectId(),
                    name: 'Sarah Chen',
                    age: 26,
                    hometown: 'Boston, MA',
                    interestOptions: ['hiking', 'photography', 'yoga', 'brunch spots'],
                    description: 'Adventure seeker and coffee enthusiast. Always planning my next trip!',
                    photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=faces&q=80',
                    instagram: 'sarahchen.travels'
                },
                {
                    _id: new ObjectId(),
                    name: 'Marcus Johnson',
                    age: 31,
                    hometown: 'Chicago, IL',
                    interestOptions: ['museums', 'food tours', 'architecture', 'jazz clubs'],
                    description: 'History buff and foodie. Love discovering local culture.',
                    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=faces&q=80',
                    instagram: 'marcus.adventures'
                },
                {
                    _id: new ObjectId(),
                    name: 'Emma Rodriguez',
                    age: 24,
                    hometown: 'Miami, FL',
                    interestOptions: ['beaches', 'nightlife', 'coffee', 'street art'],
                    description: 'Beach lover and art enthusiast. Living for sunsets and good vibes.',
                    photoUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=faces&q=80',
                    instagram: 'emma.explores'
                },
                {
                    _id: new ObjectId(),
                    name: 'David Kim',
                    age: 29,
                    hometown: 'Seattle, WA',
                    interestOptions: ['hiking', 'coffee', 'tech meetups', 'bookstores'],
                    description: 'Software engineer by day, trail explorer by weekend.',
                    photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop&crop=faces&q=80',
                    instagram: 'davidkim.hikes'
                },
                {
                    _id: new ObjectId(),
                    name: 'Olivia Thompson',
                    age: 27,
                    hometown: 'Austin, TX',
                    interestOptions: ['live music', 'food tours', 'hiking', 'yoga'],
                    description: 'Music festival hopper and taco connoisseur.',
                    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&crop=faces&q=80',
                    instagram: 'olivia.wanderlust'
                }
            ];

            // Clear existing users and insert test data
            await usersCollection.deleteMany({});
            await usersCollection.insertMany(testUsers);

            return res.json({ message: 'Seeded ' + testUsers.length + ' test users', count: testUsers.length });
        } catch (error) {
            console.error('Error seeding users:', error);
            return res.status(500).json({ error: 'Failed to seed users' });
        }
    });

    router.get('/get-matches', async (req, res) => {
        try {
            const userId = req.query.userId || MASTER_USER_ID;
            const limit = parseLimit(req.query.limit);

            if (!isValidObjectId(userId)) {
                return res.status(400).json({ error: 'Invalid userId format' });
            }

            const viewer = await usersCollection.findOne({ _id: new ObjectId(userId) });

            if (!viewer) {
                return res.status(404).json({ error: 'Viewer not found' });
            }

            const candidates = await usersCollection
                .find({ _id: { $ne: new ObjectId(userId) } })
                .toArray();

            const scoredCandidates = candidates.map(candidate => {
                const score = scoreCandidate(viewer, candidate);
                return {
                    candidate,
                    score
                };
            });

            const withOverlap = scoredCandidates
                .filter(item => item.score.sharedCount > 0)
                .sort((a, b) => {
                    if (b.score.sharedCount !== a.score.sharedCount) {
                        return b.score.sharedCount - a.score.sharedCount;
                    }
                    if (b.score.jaccard !== a.score.jaccard) {
                        return b.score.jaccard - a.score.jaccard;
                    }
                    return a.score.ageDiff - b.score.ageDiff;
                });

            const withoutOverlap = scoredCandidates
                .filter(item => item.score.sharedCount === 0)
                .sort((a, b) => {
                    if (a.score.ageDiff !== b.score.ageDiff) {
                        return a.score.ageDiff - b.score.ageDiff;
                    }
                    return b.score.sharedCount - a.score.sharedCount;
                });

            const results = [];

            for (const item of withOverlap) {
                if (results.length >= limit) break;
                results.push(buildMatchResponse(item.candidate, item.score));
            }

            if (results.length < limit) {
                for (const item of withoutOverlap) {
                    if (results.length >= limit) break;
                    results.push(buildMatchResponse(item.candidate, item.score));
                }
            }

            return res.json({
                viewer: sanitizeUser(viewer),
                matches: results
            });
        } catch (error) {
            console.error('Error fetching matches:', error);
            return res.status(500).json({ error: 'Failed to fetch matches' });
        }
    });

    return router;
}
