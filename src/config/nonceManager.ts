import { ethers } from 'ethers';
import { envConfigs } from './envconfig';
import rpcManager from './rpcManager';
import logger from './logger';

interface NonceState {
  currentNonce: number;
  lastFetched: Date;
}

class NonceManager {
  private nonceMap: Map<string, NonceState> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.startRefreshCycle();
  }

  /**
   * Initialize nonce for an admin wallet
   */
  public async initializeNonce(adminAddress: string): Promise<number> {
    try {
      const providerUrl = rpcManager.getNextProvider();
      const provider = new ethers.providers.JsonRpcProvider(providerUrl);
      
      const nonce = await provider.getTransactionCount(adminAddress);
      
      this.nonceMap.set(adminAddress, {
        currentNonce: nonce,
        lastFetched: new Date(),
      });

      logger.info(`Nonce initialized for ${adminAddress}: ${nonce}`);
      return nonce;
    } catch (error) {
      logger.error(`Failed to initialize nonce for ${adminAddress}: ${error}`);
      throw error;
    }
  }

  /**
   * Get the next nonce for an admin (increments after retrieval)
   */
  public getNextNonce(adminAddress: string): number {
    const state = this.nonceMap.get(adminAddress);
    
    if (!state) {
      throw new Error(`Nonce not initialized for ${adminAddress}. Call initializeNonce first.`);
    }

    const currentNonce = state.currentNonce;
    // Increment for next call
    state.currentNonce++;

    return currentNonce;
  }

  /**
   * Refresh nonce from RPC for all admins
   */
  public async refreshAllNonces(): Promise<void> {
    for (const [adminAddress] of this.nonceMap) {
      try {
        await this.initializeNonce(adminAddress);
      } catch (error) {
        logger.error(`Failed to refresh nonce for ${adminAddress}: ${error}`);
        // Continue with other admins
      }
    }
  }

  /**
   * Start periodic refresh cycle
   */
  private startRefreshCycle(): void {
    this.refreshInterval = setInterval(async () => {
      await this.refreshAllNonces();
    }, this.REFRESH_INTERVAL);
  }

  /**
   * Get current nonce state without incrementing
   */
  public getCurrentNonce(adminAddress: string): number | null {
    const state = this.nonceMap.get(adminAddress);
    return state ? state.currentNonce : null;
  }

  /**
   * Destroy manager and clear intervals
   */
  public destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.nonceMap.clear();
  }

  /**
   * Get all nonce states (for debugging)
   */
  public getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [address, state] of this.nonceMap) {
      stats[address] = {
        currentNonce: state.currentNonce,
        lastFetched: state.lastFetched,
      };
    }
    return stats;
  }
}

export default new NonceManager();
