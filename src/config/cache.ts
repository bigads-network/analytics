import NodeCache from 'node-cache';

// stdTTL: time to live in seconds for every cache entry
const cache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes

export default cache; 