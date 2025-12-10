import axios from 'axios';
import { envConfigs } from './envconfig';
import logger from './logger';

interface RpcEndpoint {
  url: string;
  isHealthy: boolean;
  failureCount: number;
  lastChecked: Date;
  rateLimitedUntil?: Date;
  requestCount: number;
  lastRequestTime: Date;
}

class RpcManager {
  private rpcPool: RpcEndpoint[] = [];
  private currentIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly RATE_LIMIT_COOLDOWN = 10000; // 10 seconds
  private readonly RATE_LIMIT_MAX_REQUESTS = 5; // Max 5 requests per window
  private readonly RATE_LIMIT_WINDOW = 10000; // Per 10 seconds
  private readonly FAILURE_THRESHOLD = 3;

  constructor() {
    this.initializePool();
    this.startHealthCheck();
  }

  private initializePool() {
    if (envConfigs.xdcProviders && envConfigs.xdcProviders.length > 0) {
      envConfigs.xdcProviders.forEach((url) => {
        this.rpcPool.push({
          url,
          isHealthy: true,
          failureCount: 0,
          lastChecked: new Date(),
          requestCount: 0,
          lastRequestTime: new Date(),
        });
      });
    }

    logger.info(`RPC: ${this.rpcPool.length} endpoints loaded`);
  }

  /**
   * Get next provider with rate limit awareness
   */
  public getNextProvider(): string {
    const now = new Date();
    
    // Reset request count if window expired
    for (const provider of this.rpcPool) {
      if (now.getTime() - provider.lastRequestTime.getTime() > this.RATE_LIMIT_WINDOW) {
        provider.requestCount = 0;
      }
    }

    const availableProviders = this.rpcPool.filter((p) => {
      if (!p.isHealthy) return false;
      if (p.rateLimitedUntil && now < p.rateLimitedUntil) return false;
      if (p.requestCount >= this.RATE_LIMIT_MAX_REQUESTS) return false;
      return true;
    });

    if (availableProviders.length === 0) {
      const notBlocked = this.rpcPool.filter((p) => !p.rateLimitedUntil || now >= p.rateLimitedUntil);
      if (notBlocked.length === 0) return this.rpcPool[0]?.url || '';
      const provider = notBlocked[this.currentIndex++ % notBlocked.length];
      provider.requestCount++;
      provider.lastRequestTime = now;
      return provider.url;
    }

    const provider = availableProviders[this.currentIndex++ % availableProviders.length];
    provider.requestCount++;
    provider.lastRequestTime = now;
    return provider.url;
  }

  /**
   * Handle RPC errors
   */
  public handleError(url: string, error: any): void {
    const endpoint = this.rpcPool.find((p) => p.url === url);
    if (!endpoint) return;

    const isRateLimit = error?.response?.status === 429 || 
                       error?.message?.toLowerCase?.().includes('rate limit') ||
                       error?.message?.toLowerCase?.().includes('too many');

    if (isRateLimit) {
      endpoint.rateLimitedUntil = new Date(Date.now() + this.RATE_LIMIT_COOLDOWN);
      endpoint.requestCount = this.RATE_LIMIT_MAX_REQUESTS;
      return;
    }

    endpoint.failureCount++;
    if (endpoint.failureCount >= this.FAILURE_THRESHOLD) {
      endpoint.isHealthy = false;
    }
  }

  /**
   * Record success
   */
  public recordSuccess(url: string): void {
    const endpoint = this.rpcPool.find((p) => p.url === url);
    if (endpoint) {
      endpoint.failureCount = Math.max(0, endpoint.failureCount - 1);
      endpoint.rateLimitedUntil = undefined;
      endpoint.lastChecked = new Date();
    }
  }

  private async checkHealth(endpoint: RpcEndpoint) {
    if (endpoint.rateLimitedUntil && new Date() < endpoint.rateLimitedUntil) {
      return;
    }

    try {
      const response = await axios.post(
        endpoint.url,
        {
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1,
        },
        { timeout: envConfigs.rpcTimeoutMs }
      );

      if (response.data.result || response.data.result === '0x0') {
        endpoint.isHealthy = true;
        endpoint.failureCount = 0;
        endpoint.rateLimitedUntil = undefined;
      }
    } catch (error) {
      this.handleError(endpoint.url, error);
    }
  }

  private startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      for (const endpoint of this.rpcPool) {
        await this.checkHealth(endpoint);
      }
    }, 60000);
  }

  public destroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  public getStats() {
    return this.rpcPool.map((p) => ({
      url: p.url,
      healthy: p.isHealthy,
      failures: p.failureCount,
      requests: p.requestCount,
      rateLimited: p.rateLimitedUntil ? p.rateLimitedUntil > new Date() : false,
    }));
  }
}

export default new RpcManager();
