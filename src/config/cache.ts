import NodeCache from 'node-cache';

// stdTTL: time to live in seconds for every cache entry
const cache = new NodeCache({ stdTTL: 1500 }); // Cache for 25 minutes

// Dashboard-specific cache with 8 minute TTL
export const dashboardCache = new NodeCache({ stdTTL: 480 }); // 8 minutes for dashboard data

export default cache; 