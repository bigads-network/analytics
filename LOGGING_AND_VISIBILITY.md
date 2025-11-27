# Comprehensive Logging & Visibility Added

## Problem
You couldn't see what was happening - system would just stop after 10-20 transactions with no indication why.

## Solution
Added comprehensive logging at every level to show:
- Every request received
- Every transaction sent (with hash)
- Every transaction failed (with reason)
- Every transaction rejected (with reason)
- Per-second metrics
- Every 10 seconds: full status report

---

## What You'll Now See Every 10 Seconds

```
[STATS-10SEC] Received=143(14.3/s) | Sent=142(14.2/s) | Failed=0(0.0/s) | Rejected=1(0.1/s) | Queue=0
[QUEUE-CHECK] depth=0 | isProcessing=false | total_sent=142 | total_failed=0 | total_rejected=1
[RECENT-TXS] 0xabc123...(W2), 0xdef456...(W5), 0x789abc...(W1), 0xghijkl...(W3), 0xmnopqr...(W4)
```

This tells you:
- **Received**: How many requests arrived in last 10 seconds
- **Sent**: How many actually got sent to blockchain
- **Failed**: How many RPC calls failed
- **Rejected**: How many requests were invalid/rejected
- **Queue**: Current pending transactions
- **Recent hashes**: Last 5 transaction hashes sent

---

## What You'll See For Every Transaction

### Request Arrives
```
[DEBUG] [REQ-IN] eventId=event_123 total_received=47
```

### If Rejected (Invalid)
```
[WARN] [REQ-REJECTED] no devicedata
[WARN] [REQ-REJECTED] invalid gameId or id
[WARN] [REQ-REJECTED] missing snapshot fields
[WARN] [REQ-REJECTED] wallet0 has zero balance
```

### When Sent Successfully
```
[INFO] [TX-SENT] wallet2 hash=0xabc123def456... nonce=42
```

### When Failed
```
[WARN] [TX-FAILED] wallet1 nonce=15 error=insufficient funds for...
[ERROR] [TX-EXCEPTION] fireEvent error=connection timeout
```

### Nonce Issues
```
[INFO] [NONCE-SYNC] wallet3 synced to 55
[WARN] [NONCE-ERROR] Underpriced wallet2
```

---

## New Tracking Variables

```typescript
// Track metrics per second
let totalRequestsReceived = 0;      // Total requests ever
let totalTransactionsSent = 0;      // Total sent to blockchain
let totalTransactionsFailed = 0;    // Total RPC failures
let totalTransactionsRejected = 0;  // Total rejected (invalid)

// Track recent TX hashes
const recentTxHashes: { 
  hash: string; 
  timestamp: number; 
  walletIndex: number 
}[] = [];  // Last 100 hashes

// Per-second counters
let perSecondStats = {
  received: 0,      // Reset every 10s
  sent: 0,          // Reset every 10s
  failed: 0,        // Reset every 10s
  rejected: 0,      // Reset every 10s
  lastReport: Date.now()
};
```

---

## Logging Points Added

### In fireEvent()
- `[REQ-IN]` - Request received
- `[REQ-REJECTED]` - Request rejected (every rejection reason logged)
- `[TX-SENT]` - Transaction successfully sent with hash
- `[TX-FAILED]` - Transaction RPC call failed
- `[TX-EXCEPTION]` - Unexpected error
- `[NONCE-SYNC]` - Nonce was synced
- `[NONCE-ERROR]` - Nonce underpriced error

### In sendSingleTransaction()
- `[TX-SENT]` - Transaction sent with hash
- `[TX-FAILED]` - Transaction failed
- `[TX-EXCEPTION]` - Unexpected error

### Global Stats
- `[STATS-10SEC]` - Every 10 seconds, shows rates per second
- `[QUEUE-CHECK]` - Every 10 seconds, shows queue depth and totals
- `[RECENT-TXS]` - Every 10 seconds, shows last 5 TX hashes

---

## Why Stops After 10-20 Txs - Diagnosis Guide

Now when it stops, look for these patterns:

### Pattern 1: Queue Accumulating
```
[QUEUE-CHECK] depth=150 | isProcessing=false | total_sent=20 | total_failed=0
[QUEUE-CHECK] depth=300 | isProcessing=false | total_sent=20 | total_failed=0
```
→ **Problem**: Queue is piling up, processGlobalBatch not running
→ **Action**: Check if isProcessingBatch is stuck

### Pattern 2: Failures Increasing
```
[STATS-10SEC] Sent=20(2.0/s) | Failed=100(10.0/s) | Rejected=0 | Queue=0
```
→ **Problem**: RPC calls are failing
→ **Action**: Check RPC provider status, network connectivity

### Pattern 3: Rejections High
```
[STATS-10SEC] Received=150(15/s) | Sent=10(1/s) | Rejected=140(14/s) | Queue=0
```
→ **Problem**: Most requests are invalid
→ **Action**: Check gameId, eventId, devicedata validity

### Pattern 4: Everything Stops
```
[STATS-10SEC] Received=50(5/s) | Sent=50(5/s) | Failed=0 | Queue=0
[STATS-10SEC] Received=0(0/s) | Sent=0(0/s) | Failed=0 | Queue=0   ← Stops here
```
→ **Problem**: Requests stopped coming in OR connection to endpoint failed
→ **Action**: Check if client is still sending, check network

---

## How To Use For Debugging

### Real-time monitoring
```bash
# Watch logs as they come in, filtering for stats
tail -f logs/app.log | grep -E "\[STATS|QUEUE-CHECK|REQ-REJECTED|TX-SENT|TX-FAILED"
```

### See only transaction hashes
```bash
# See every transaction hash sent
tail -f logs/app.log | grep "\[TX-SENT\]"
```

### See only rejections
```bash
# See why requests are rejected
tail -f logs/app.log | grep "\[REQ-REJECTED\]"
```

### See all errors
```bash
# See all errors that occurred
tail -f logs/app.log | grep -E "\[TX-FAILED\]|\[TX-EXCEPTION\]"
```

### Full diagnostic view
```bash
# Show everything (busy output but complete visibility)
tail -f logs/app.log | grep -E "\[STATS|QUEUE|REQ-|TX-|NONCE"
```

---

## What Changed In Code

### 1. New Tracking Variables (Lines 324-389)
- Added `totalTransactionsRejected`
- Added `recentTxHashes` array
- Added `perSecondStats` object with counters
- Added `reportPerSecondStats()` function

### 2. fireEvent() Enhanced (Lines 1258-1435)
- Log every request received: `[REQ-IN]`
- Log every rejection with reason: `[REQ-REJECTED]`
- Increment `perSecondStats.received`, `.rejected`
- Log every successful send with hash: `[TX-SENT]`
- Log every failure: `[TX-FAILED]`
- Track hash in `recentTxHashes`

### 3. sendSingleTransaction() Enhanced (Lines 530-580)
- Log successful send with hash: `[TX-SENT]`
- Log failed send: `[TX-FAILED]`
- Track hash in `recentTxHashes`
- Increment per-second counters

### 4. Global Logging (Lines 335-387)
- Every 1 second: call `reportPerSecondStats()`
- Every 10 seconds: log `[STATS-10SEC]` with rates
- Every 10 seconds: log `[QUEUE-CHECK]` with status
- Every 10 seconds: log `[RECENT-TXS]` with last hashes

---

## Key Improvements

✅ **See every request** - Know when they arrive and why they're rejected
✅ **See every send** - Know exactly which transactions went to blockchain (with hash)
✅ **See failures** - Know exactly when and why RPC calls fail
✅ **Per-second rates** - Know if you're hitting the limit or if there's a problem
✅ **Recent TX hashes** - Can verify transactions on blockchain immediately
✅ **Queue depth** - See if transactions are accumulating or processing normally
✅ **Processing status** - Know if system is actually processing or stuck

---

## Expected Behavior Now

When running normally at 100 req/sec:
```
[STATS-10SEC] Received=1000(100/s) | Sent=999(99.9/s) | Failed=0(0/s) | Rejected=1(0.1/s) | Queue=0
[QUEUE-CHECK] depth=0 | isProcessing=false | total_sent=999 | total_failed=0 | total_rejected=1
[RECENT-TXS] 0xabc...(W2), 0xdef...(W5), 0x789...(W1), 0xghi...(W3), 0xmno...(W4)

[STATS-10SEC] Received=1000(100/s) | Sent=1000(100/s) | Failed=0(0/s) | Rejected=0(0/s) | Queue=0
[QUEUE-CHECK] depth=0 | isProcessing=false | total_sent=1999 | total_failed=0 | total_rejected=1
[RECENT-TXS] 0xpqr...(W7), 0xstu...(W2), 0xvwx...(W4), 0xyzz...(W1), 0xaaa...(W3)
```

This shows:
- ✅ Receiving at target rate
- ✅ Sending at target rate
- ✅ No failures
- ✅ Queue empty (not accumulating)
- ✅ Hashes being generated continuously

---

## Build Status
✅ TypeScript: NO ERRORS
✅ npm build: PASSING
✅ Ready for deployment

Deploy and you'll finally see what's happening!
