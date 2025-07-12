# Dashboard Performance Optimization Guide

## Overview
We've implemented comprehensive optimizations to address the following issues:
1. **Duplicate API calls** - Prevented with request fingerprinting and caching
2. **Poor UX (waiting for all data)** - Implemented progressive loading with SSE
3. **Extended caching** - Increased from 10 minutes to 25 minutes

## Key Improvements

### 1. Unified Dashboard Endpoint
- **Endpoint**: `GET /dashboard/all`
- **Features**:
  - Single API call fetches all dashboard data
  - Parallel data fetching internally
  - ETag support for efficient caching
  - 25-minute server-side cache

### 2. Progressive Loading with Server-Sent Events (SSE)
- **Endpoint**: `GET /dashboard/stream`
- **Features**:
  - Data loads progressively as it becomes available
  - No waiting for all metrics to load
  - Real-time updates to the UI

### 3. Duplicate Request Prevention
- Request fingerprinting prevents duplicate calls within 3-second window
- Automatic response caching for identical requests
- Clear error messages with retry timing

## Frontend Integration Examples

### 1. Using the Unified Endpoint

```javascript
// React example with axios
import { useState, useEffect } from 'react';
import axios from 'axios';

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const fetchDashboard = async () => {
      try {
        const response = await axios.get('/dashboard/all', {
          // Include ETag for efficient caching
          headers: {
            'If-None-Match': localStorage.getItem('dashboard-etag') || ''
          }
        });
        
        if (mounted && response.status === 200) {
          setData(response.data.data);
          // Store ETag for next request
          const etag = response.headers['etag'];
          if (etag) {
            localStorage.setItem('dashboard-etag', etag);
          }
        }
      } catch (error) {
        if (error.response?.status === 304) {
          // Data hasn't changed, use cached version
          console.log('Using cached data');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div>
      <h2>User Counts: {data?.userCounts}</h2>
      <h2>Monthly Users: {data?.monthlyUsers}</h2>
      <h2>Monthly Transactions: {data?.monthlyTransactions}</h2>
      {/* Render charts for daily data */}
    </div>
  );
}
```

### 2. Progressive Loading with SSE

```javascript
// React example with Server-Sent Events
import { useState, useEffect } from 'react';

function ProgressiveDashboard() {
  const [metrics, setMetrics] = useState({
    userCounts: null,
    dailyActiveUsers: null,
    dailyTransactions: null,
    monthlyUsers: null,
    monthlyTransactions: null
  });

  useEffect(() => {
    const eventSource = new EventSource('/dashboard/stream');

    eventSource.addEventListener('userCounts', (event) => {
      const data = JSON.parse(event.data);
      setMetrics(prev => ({ ...prev, userCounts: data.data }));
    });

    eventSource.addEventListener('dailyActiveUsers', (event) => {
      const data = JSON.parse(event.data);
      setMetrics(prev => ({ ...prev, dailyActiveUsers: data.data }));
    });

    eventSource.addEventListener('dailyTransactions', (event) => {
      const data = JSON.parse(event.data);
      setMetrics(prev => ({ ...prev, dailyTransactions: data.data }));
    });

    eventSource.addEventListener('monthlyUsers', (event) => {
      const data = JSON.parse(event.data);
      setMetrics(prev => ({ ...prev, monthlyUsers: data.data }));
    });

    eventSource.addEventListener('monthlyTransactions', (event) => {
      const data = JSON.parse(event.data);
      setMetrics(prev => ({ ...prev, monthlyTransactions: data.data }));
    });

    eventSource.addEventListener('complete', () => {
      eventSource.close();
    });

    eventSource.addEventListener('error', (event) => {
      console.error('SSE Error:', event);
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div>
      <div>
        <h3>User Counts</h3>
        {metrics.userCounts ? (
          <span>{metrics.userCounts}</span>
        ) : (
          <span>Loading...</span>
        )}
      </div>
      
      <div>
        <h3>Monthly Users</h3>
        {metrics.monthlyUsers ? (
          <span>{metrics.monthlyUsers}</span>
        ) : (
          <span>Loading...</span>
        )}
      </div>

      {/* Add other metrics similarly */}
    </div>
  );
}
```

### 3. Preventing Duplicate Calls in React

```javascript
// Use React Query or SWR for automatic deduplication
import { useQuery } from 'react-query';

function OptimizedDashboard() {
  const { data, isLoading, error } = useQuery(
    'dashboardData',
    () => fetch('/dashboard/all').then(res => res.json()),
    {
      staleTime: 25 * 60 * 1000, // 25 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false
    }
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading dashboard</div>;

  return <div>{/* Render your dashboard */}</div>;
}
```

## API Response Headers

All dashboard endpoints now include these headers:
- `Cache-Control: private, max-age=1500` - Browser caching for 25 minutes
- `ETag: [hash]` - For conditional requests
- `X-Cache: HIT/MISS` - Indicates if data was from cache
- `X-Duplicate-Request: true` - For duplicate requests

## Performance Tips

1. **Use the unified endpoint** (`/dashboard/all`) for initial load
2. **Implement browser caching** using ETags
3. **Use progressive loading** (`/dashboard/stream`) for better UX
4. **Avoid React StrictMode** in production to prevent double renders
5. **Use React Query or SWR** for automatic request deduplication

## Cache Invalidation

The cache automatically expires after 25 minutes. If you need to force refresh:
- Add a query parameter: `/dashboard/all?force=true`
- Clear browser cache and localStorage ETags
- Wait for the cache TTL to expire

## Monitoring

Check response headers to monitor cache performance:
- `X-Cache: HIT` - Data served from cache (fast)
- `X-Cache: MISS` - Fresh data fetched (slower)
- `X-Duplicate-Request: true` - Duplicate prevented 