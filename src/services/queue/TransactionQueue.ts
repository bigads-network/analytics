import logger from '../../config/logger';

export interface QueuedTransaction {
  id: string; // Unique identifier for tracking
  userId: string;
  gameId: number;
  eventId: number;
  metadata: string;
  userData: any;
  createdAt: number;
  attempts: number;
  lastError?: string;
  status: 'pending' | 'processing' | 'sent' | 'confirmed' | 'failed';
}

export interface BatchResult {
  batchId: string;
  transactionIds: string[];
  userOperationHash?: string;
  transactionHash?: string;
  blockNumber?: number;
  success: boolean;
  error?: string;
  processedAt: number;
}

export class TransactionQueue {
  private queue: QueuedTransaction[] = [];
  private processingBatches = new Map<string, QueuedTransaction[]>();
  private transactionStatus = new Map<string, Partial<BatchResult>>();
  private nonce: number = 0;
  private nonceLastSync: number = 0;
  private isProcessing: boolean = false;

  // Configuration
  private batchSize: number;
  private batchTimeoutMs: number;
  private parallelLimit: number;
  private nonceRefreshIntervalMs: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private backoffMultiplier: number;

  // Timers
  private batchTimers = new Map<string, NodeJS.Timeout>();

  constructor(config: {
    batchSize?: number;
    batchTimeoutMs?: number;
    parallelLimit?: number;
    nonceRefreshIntervalMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    backoffMultiplier?: number;
  } = {}) {
    this.batchSize = config.batchSize || 8;
    this.batchTimeoutMs = config.batchTimeoutMs || 5000;
    this.parallelLimit = config.parallelLimit || 5;
    this.nonceRefreshIntervalMs = config.nonceRefreshIntervalMs || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelayMs = config.retryDelayMs || 1000;
    this.backoffMultiplier = config.backoffMultiplier || 2;

    logger.info(
      `TransactionQueue initialized: batch=${this.batchSize}, ` +
      `timeout=${this.batchTimeoutMs}ms, parallel=${this.parallelLimit}, ` +
      `retries=${this.maxRetries}`
    );
  }

  /**
   * Add a transaction to the queue
   */
  public enqueue(transaction: Omit<QueuedTransaction, 'id' | 'createdAt' | 'attempts' | 'status'>): string {
    const id = this.generateTransactionId();
    const queuedTx: QueuedTransaction = {
      ...transaction,
      id,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
    };

    this.queue.push(queuedTx);
    this.transactionStatus.set(id, {
      batchId: '',
      transactionIds: [id],
      success: false,
      processedAt: 0,
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.startBatchProcessing();
    }

    return id;
  }

  /**
   * Get the status of a transaction
   */
  public getStatus(transactionId: string): Partial<BatchResult> | null {
    return this.transactionStatus.get(transactionId) || null;
  }

  /**
   * Get current queue statistics
   */
  public getStats() {
    return {
      queueSize: this.queue.length,
      pendingCount: this.queue.filter(tx => tx.status === 'pending').length,
      processingCount: this.processingBatches.size,
      activeParallel: Math.min(this.processingBatches.size, this.parallelLimit),
      currentNonce: this.nonce,
      lastNonceSync: this.nonceLastSync,
      totalTracked: this.transactionStatus.size,
    };
  }

  /**
   * Set initial nonce (call on startup)
   */
  public setNonce(nonce: number): void {
    this.nonce = nonce;
    this.nonceLastSync = Date.now();
    logger.info(`Nonce initialized to: ${nonce}`);
  }

  /**
   * Increment nonce after successful UO submission
   */
  public incrementNonce(): number {
    this.nonce++;
    return this.nonce;
  }

  /**
   * Force nonce refresh/resynchronization
   */
  public shouldRefreshNonce(): boolean {
    const elapsed = Date.now() - this.nonceLastSync;
    return elapsed > this.nonceRefreshIntervalMs;
  }

  /**
   * Get pending nonce for next UO
   */
  public getPendingNonce(): number {
    return this.nonce;
  }

  /**
   * Create a batch from queue (time-based: whatever is available)
   * Instead of waiting for batchSize, take all available transactions
   */
  public createBatch(): QueuedTransaction[] | null {
    if (this.queue.length === 0) {
      return null;
    }

    // Take all pending transactions available (not limited by batchSize)
    // batchSize is now just a safety limit, but we send every 10 seconds
    const batch = this.queue.splice(0, Math.min(this.batchSize, this.queue.length));

    batch.forEach(tx => {
      tx.status = 'processing';
      tx.attempts += 1;
    });

    return batch;
  }

  /**
   * Register batch as processing
   */
  public registerBatch(batchId: string, transactions: QueuedTransaction[]): void {
    this.processingBatches.set(batchId, transactions);
  }

  /**
   * Mark batch as completed
   */
  public completeBatch(
    batchId: string,
    result: {
      userOperationHash?: string;
      transactionHash?: string;
      blockNumber?: number;
      success: boolean;
      error?: string;
    }
  ): void {
    const batch = this.processingBatches.get(batchId);
    if (!batch) {
      logger.warn(`Batch ${batchId} not found in processing map`);
      return;
    }

    const batchResult: BatchResult = {
      batchId,
      transactionIds: batch.map(tx => tx.id),
      userOperationHash: result.userOperationHash,
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber,
      success: result.success,
      error: result.error,
      processedAt: Date.now(),
    };

    // Update each transaction status
    batch.forEach(tx => {
      if (result.success) {
        tx.status = 'confirmed';
      } else {
        // Decide if retry is needed
        if (tx.attempts < this.maxRetries) {
          tx.status = 'pending'; // Will be retried
          tx.lastError = result.error;
          // Re-queue for retry
          this.queue.push(tx);
        } else {
          tx.status = 'failed';
          tx.lastError = result.error;
        }
      }

      // Update tracking
      this.transactionStatus.set(tx.id, batchResult);
    });

    this.processingBatches.delete(batchId);

    if (result.success) {
      console.log(`[CONFIRMED] ${batch.length} TXs | Block: ${result.blockNumber} | Hash: ${result.transactionHash?.substring(0, 10)}...`);
    } else {
      console.log(`[BATCH_FAILED] ${batch.length} TXs | Error: ${result.error}`);
    }
  }

  /**
   * Start batch processing loop (time-based: every 10 seconds)
   */
  private startBatchProcessing(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Start the 10-second batch processing timer
    this.processBatches();
    
    logger.info(`Batch processing started with ${this.batchTimeoutMs}ms interval`);
  }

  /**
   * Process batches continuously
   */
  private async processBatches(): Promise<void> {
    // Use a fixed 10-second interval to create and submit batches
    const batchInterval = setInterval(async () => {
      if (!this.isProcessing) {
        clearInterval(batchInterval);
        return;
      }

      // Check if we can submit more batches in parallel
      if (this.processingBatches.size < this.parallelLimit && this.queue.length > 0) {
        const batch = this.createBatch();
        if (batch && batch.length > 0) {
          const batchId = this.generateBatchId();
          this.registerBatch(batchId, batch);

          // Process this batch asynchronously (fire and forget)
          this.processSingleBatch(batchId, batch).catch(error => {
            logger.error(`Unexpected error processing batch ${batchId}:`, error);
            this.completeBatch(batchId, {
              success: false,
              error: error.message || 'Unknown error',
            });
          });
        }
      }
    }, this.batchTimeoutMs); // Fixed 10-second interval (from batchTimeoutMs)

    // Keep a reference to clear on shutdown
    this.batchTimers.set('main', batchInterval);
  }

  /**
   * Process a single batch (called asynchronously)
   * This returns a promise but doesn't block the main loop
   */
  public async processSingleBatch(batchId: string, transactions: QueuedTransaction[]): Promise<void> {
    // This will be overridden by the controller
    // Default implementation just marks as sent
    logger.info(`Processing batch ${batchId} with ${transactions.length} transactions`);
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.isProcessing = false;
    
    // Clear all timers
    for (const [_, timer] of this.batchTimers.entries()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();

    logger.info(
      `Queue shutdown. Remaining: ${this.queue.length} pending, ` +
      `${this.processingBatches.size} processing`
    );
  }

  /**
   * Clear all data (for testing)
   */
  public clear(): void {
    this.queue = [];
    this.processingBatches.clear();
    this.transactionStatus.clear();
    for (const [_, timer] of this.batchTimers.entries()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();
  }
}

// Export singleton instance
export const transactionQueue = new TransactionQueue();
