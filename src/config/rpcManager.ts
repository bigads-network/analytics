import axios from 'axios';
import { envConfigs } from './envconfig';
import logger from './logger';

interface RpcEndpoint {
  url: string;
  isHealthy: boolean;
  failureCount: number;
  lastChecked: Date;
}

class RpcManager {
  private rpcPool: RpcEndpoint[] = [];
  private currentIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializePool();
    this.startHealthCheck();
  }

  private initializePool() {
    // Initialize XDC providers
    if (envConfigs.xdcProviders && envConfigs.xdcProviders.length > 0) {
      envConfigs.xdcProviders.forEach((url) => {
        this.rpcPool.push({
          url,
          isHealthy: true,
          failureCount: 0,
          lastChecked: new Date(),
        });
      });
    }

    logger.info(`RPC Manager initialized with ${this.rpcPool.length} XDC endpoints`);
  }

  /**
   * Round-robin selection with health checking
   */
  public getNextProvider(): string {
    const healthyProviders = this.rpcPool.filter((p) => p.isHealthy);

    if (healthyProviders.length === 0) {
      logger.warn(`No healthy providers, using all available`);
      if (this.rpcPool.length === 0) {
        throw new Error(`No XDC providers configured`);
      }
      return this.rpcPool[this.currentIndex++ % this.rpcPool.length].url;
    }

    const provider = healthyProviders[this.currentIndex++ % healthyProviders.length];
    return provider.url;
  }

  /**
   * Record RPC failure for circuit breaking
   */
  public recordFailure(url: string) {
    const endpoint = this.rpcPool.find((p) => p.url === url);
    if (endpoint) {
      endpoint.failureCount++;
      if (endpoint.failureCount >= 5) {
        endpoint.isHealthy = false;
        logger.warn(`RPC endpoint marked unhealthy: ${url}`);
      }
    }
  }

  /**
   * Record RPC success
   */
  public recordSuccess(url: string) {
    const endpoint = this.rpcPool.find((p) => p.url === url);
    if (endpoint) {
      endpoint.failureCount = Math.max(0, endpoint.failureCount - 1);
      endpoint.lastChecked = new Date();
    }
  }

  /**
   * Health check RPC endpoints
   */
  private async checkHealth(endpoint: RpcEndpoint) {
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
      }
    } catch (error) {
      this.recordFailure(endpoint.url);
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      for (const endpoint of this.rpcPool) {
        await this.checkHealth(endpoint);
      }
    }, 60000); // Check every minute
  }

  public destroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  /**
   * Get provider statistics
   */
  public getStats() {
    return this.rpcPool.map((p) => ({
      url: p.url,
      isHealthy: p.isHealthy,
      failureCount: p.failureCount,
      lastChecked: p.lastChecked,
    }));
  }
}

export default new RpcManager();
