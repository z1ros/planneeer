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
        photoUrl: user.photoUrl
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
