import {Request , Response } from 'express';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { sha512_256 } from 'js-sha512';
import { ethers } from 'ethers';
import {
    createSmartAccountClient,
    createBicoPaymasterClient,
    toNexusAccount,
    Logger,
  } from '@biconomy/abstractjs';
import { chainIdToBundlerUrl, chainIdToChainName, envConfigs } from '../config/envconfig';
import { generateGameToken } from '../config/gameToken';
import dbservices from '../services/dbservices';
import { polygon, polygonAmoy } from 'viem/chains';
import logger from '../config/logger';
import { transactionQueue, type QueuedTransaction } from '../services/queue';

/**
 * CONTRACT ABI - Metadata Storage
 * Contains event and function definitions for storeMetadata
 */
const METADATA_STORAGE_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "metadata",
        "type": "string"
      }
    ],
    "name": "MetadataStored",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "metadata",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      }
    ],
    "name": "storeMetadata",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Cache for admin account to avoid repeated lookups
let cachedAdminAccount: any = null;
let cachedNexusClient: any = null;
let adminAccountRefreshTime = 0;
const ADMIN_CACHE_DURATION_MS = 60000; // 1 minute

/**
 * Get or create Biconomy Nexus Client for admin account
 * Reuses existing client to maintain nonce tracking
 */
async function getBiconomyNexusClient() {
  const now = Date.now();
  
  // Return cached client if still valid
  if (cachedNexusClient && cachedAdminAccount && (now - adminAccountRefreshTime) < ADMIN_CACHE_DURATION_MS) {
    return cachedNexusClient;
  }

  try {
    const adminId = envConfigs.adminId;
    const adminAccountDetails = await dbservices.Creator.getdetails(adminId);
    if (!adminAccountDetails) {
      throw new Error("Admin account not found in database");
    }

    const privKey = sha512_256(adminAccountDetails.devicedata + adminAccountDetails.userId);
    const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);
    const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
    const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
    const chainName = polygon;
    
    const bundlerUrl = envConfigs.bundlerUrl;
    const paymasterUrl = envConfigs.paymaster_apikey_url;
    
    const nexusClient = createSmartAccountClient({
      account: await toNexusAccount({
        signer: account,
        chain: chainName,
        transport: http(),
      }),
      transport: http(bundlerUrl),
      paymaster: createBicoPaymasterClient({ paymasterUrl }),
    });

    cachedAdminAccount = adminAccountDetails;
    cachedNexusClient = nexusClient;
    adminAccountRefreshTime = now;

    logger.info(`Biconomy client initialized/refreshed. Smart Account: ${nexusClient.account.address}`);
    return nexusClient;
  } catch (error) {
    logger.error(`Failed to initialize Biconomy client: ${error}`);
    throw error;
  }
}

/**
 * Process a batch of transactions using Biconomy
 * This is called asynchronously by the transaction queue
 */
async function processBatch(batchId: string, transactions: QueuedTransaction[]) {
  const startTime = Date.now();
  
  try {
    if (transactions.length === 0) {
      console.log(`[ERROR] Batch ${batchId} empty`);
      logger.warn(`Batch ${batchId} has no transactions`);
      transactionQueue.completeBatch(batchId, {
        success: false,
        error: 'Empty batch',
      });
      return;
    }

    console.log(`[PROCESSING] Batch ${batchId} | TXs: ${transactions.length} | Starting submission...`);

    // Get the Nexus client (cached)
    const nexusClient = await getBiconomyNexusClient();
    const contractAddress = envConfigs.contractAddress;

    // Prepare all calls for the batch
    const calls = transactions.map(tx => ({
      to: contractAddress as `0x${string}`,
      value: 0n,
      abi: METADATA_STORAGE_ABI,
      functionName: 'storeMetadata',
      args: [tx.userData.saAddress, tx.metadata, tx.gameId],
    }));

    // Send User Operation to Biconomy
    // @ts-ignore - Biconomy sendUserOperation accepts calls array
    const userOpHash = await nexusClient.sendUserOperation({
      calls: calls,
    });

    const currentNonce = transactionQueue.getPendingNonce();
    const newNonce = transactionQueue.incrementNonce();
    console.log(`[SUBMITTED] Batch ${batchId} | UO Hash: ${userOpHash.substring(0, 10)}... | Nonce: ${currentNonce} -> ${newNonce}`);

    // Wait for receipt asynchronously (non-blocking for queue)
    processReceiptAsync(batchId, userOpHash, nexusClient, transactions, startTime);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`[ERROR] Batch ${batchId} failed: ${errorMsg}`);
    logger.error(`Batch ${batchId} failed during submission: ${errorMsg}`);
    
    transactionQueue.completeBatch(batchId, {
      success: false,
      error: `Submission failed: ${errorMsg}`,
    });
  }
}

/**
 * Wait for receipt asynchronously without blocking
 */
async function processReceiptAsync(
  batchId: string,
  userOpHash: string,
  nexusClient: any,
  transactions: QueuedTransaction[],
  startTime: number
) {
  try {
    const receipt = await nexusClient.waitForUserOperationReceipt({ hash: userOpHash });
    const transactionHash = receipt.receipt.transactionHash;
    const blockNumber = receipt.receipt.blockNumber;
    const processingTime = Date.now() - startTime;

    console.log(`[CONFIRMED] Batch ${batchId} | ${transactions.length} TXs | Hash: ${transactionHash.substring(0, 10)}... | Block: ${blockNumber} | Time: ${processingTime}ms`);

    // Save all transaction records
    for (const tx of transactions) {
      try {
        await dbservices.User.saveTransactionDetails(
          tx.gameId,
          tx.userData.id,
          tx.eventId,
          transactionHash,
          polygon.name,
          "0", // amount (not used for metadata storage)
        );
      } catch (dbError) {
        console.log(`[DB ERROR] Failed to save TX ${tx.id}: ${dbError}`);
        logger.error(`Failed to save transaction ${tx.id}: ${dbError}`);
      }
    }

    // Mark batch as completed
    transactionQueue.completeBatch(batchId, {
      userOperationHash: userOpHash,
      transactionHash: transactionHash,
      blockNumber: blockNumber,
      success: true,
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`[RECEIPT ERROR] Batch ${batchId}: ${errorMsg}`);
    logger.error(`Batch ${batchId}: Receipt waiting failed: ${errorMsg}`);
    
    transactionQueue.completeBatch(batchId, {
      success: false,
      error: `Receipt failed: ${errorMsg}`,
    });
  }
}




export default class User{

    static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

    static games= async(req: Request, res: Response): Promise<any> =>{
        try {
            const games = await dbservices.User.getGames()
            return res.json({
                status: true,
                message: "Game List Fetched Successfully",
                data: games
            })
        } catch (error) {
          res.status(500).json({
            status: false,
            message: error.message || "Unexpected error occurred",
          })  
        }
    }

    static events = async(req: Request, res: Response): Promise<any> =>{
      try {
          const events = await dbservices.User.getEvents()
          return res.json({
            status: true,
            message: "Event List Fetched Successfully",
            data: events
          })
      } catch (error) {
        res.status(500).json({
          status: false,
          message: error.message || "Unexpected error occurred",
        })  
      }
    }

    static self = async(req: Request, res: Response): Promise<any>=>{
      try {
        const {devicedata} = req.body
        const details = await dbservices.User.userExits(devicedata)
        return res.json({
          status: true,
          message: "Details Fetched Successfully",
          data: details
        })
      } catch (error) {
        res.status(500).json({
          status: false,
          message: error.message || "Unexpected error occurred",
        })
      }
    }

    static count = async(req: Request, res: Response): Promise<any>=>{
      try {
        const count = await dbservices.User.counts()
        return res.json({
          status: true,
          message: "Details Fetched Successfully",
          data: count
        })
      } catch (error) {
        res.status(500).json({
          status: false,
          message: error.message || "Unexpected error occurred",
        })
      }
    }

    static transactions = async(req: Request , res:Response):Promise<any>=>{
      try {
        const transaction = await dbservices.User.getTransactions()
        return res.json({
          status: true,
          message: "Transaction List Fetched Successfully",
          transactions: transaction.transactions,
          counts: transaction.counts[0].count
        })
      } catch (error) {
        res.status(500).json({
          status: false,
          message: error.message || "Unexpected error occurred",
        }) 
      }
    }


    // static gameDetails = async(req: Request , res: Response):Promise<any>=>{
    //   try {
    //     const 
    //   } catch (error) {
    //     res.status(500).json({
    //       status: false,
    //       message: error.message || "Unexpected error occurred",
    //     })  
    //   }
    // }

    static GetUserTransacttion = async(req: Request, res: Response): Promise<any>=>{
      try {
        const userId = req.params.userId
        const transaction = await dbservices.User.getUserTransacttion(userId)
        return res.json({
          status: true,
          message: "Transaction List Fetched Successfully",
          transactions: transaction
        })
      } catch (error) {
        res.status(500).json({
          status: false,
          message: error.message || "Unexpected error occurred",
        }) 
      }
    }


    static eventTransaction = async(req:Request, res: Response): Promise<any>=>{
      try {
        const eventId = req.params.eventId
        const transaction = await dbservices.User.geteventTransacttion(eventId)
        return res.json({
          status: true,
          message: "Transaction List Fetched Successfully",
          transactions: transaction
        })
      } catch (error) {
        res.status(500).json({
          status: false,
          message: error.message || "Unexpected error occurred",
        }) 
      }
    }

    static GetGameTransacttion = async(req:Request, res:Response):Promise<any>=>{
      try {
        const gameId = req.params.gameId 
        const transaction = await dbservices.User.getGameTransacttion(gameId)
        return res.json({
          status: true,
          message: "Transaction List Fetched Successfully",
          details: transaction
        })
      } catch (error) {
        res.status(500).json({
          status: false,
          message: error.message || "Unexpected error occurred",
        }) 
      }
    }

  // static fireEvent = async(req: Request, res: Response): Promise<any>=>{
  //   console.log("Event fired")
  //   try {
  //   const abi = [
  //   {
  //   type: "function",
  //   name: "storeMetadata",
  //   inputs: [
  //     {
  //       name: "metadata",
  //       type: "string",
  //       internalType: "string",
  //     },
  //     {
  //       name: "gameId",
  //       type: "uint256",
  //       internalType: "uint256",
  //     },
  //   ],
  //   outputs: [],
  //   stateMutability: "nonpayable",
  //   },
  //   {
  //   type: "event",
  //   name: "MetadataStored",
  //   inputs: [
  //     {
  //       name: "sender",
  //       type: "address",
  //       indexed: true,
  //       internalType: "address",
  //     },
  //     {
  //       name: "gameId",
  //       type: "uint256",
  //       indexed: true,
  //       internalType: "uint256",
  //     },
  //     {
  //       name: "metadata",
  //       type: "string",
  //       indexed: false,
  //       internalType: "string",
  //     },
  //   ],
  //   anonymous: false,
  //   },
  //   ];
  //   const eventId = req.params.eventId
  //   const {gameId ,id } = await dbservices.User.getGameid(eventId)
  //   if(!gameId || !id){
  //     return res.status(400).json({ status: false, message: "Invalid Game or Event ID"});
  //   }
  //   const eventCheck = await dbservices.User.eventCheck(gameId ,eventId)
  //     if(!eventCheck){
  //     return res.status(400).json({ status: false, message: "Event does not exist for this game"});
  //     }
  //   const { devicedata } = req.body;
  //   if (!devicedata) {
  //     return res.status(400).json({ status: false, message: "Device data is required" });
  //       }
  //   let userExist = await dbservices.User.userExits(devicedata);
  //   let userId, saAddress ;
  //   const gameDetails = await dbservices.User.getGameDetails(gameId ,eventId)
  //   const bundlerUrl =envConfigs.bundlerUrl
  //   const paymasterUrl = envConfigs.paymaster_apikey_url
  //   if(userExist){
  //     if(gameDetails.creatorId=== userExist.id){
  //       return res.status(500).send({ status:false ,message : "cannot fire event for own game "})
  //     }
  //     userId =userExist.userId ;
  //     const privKey = "0x" + sha512_256(userId) ;

  //     const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

  //   const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

  //   const wallet_address = await wallet.getAddress();
  //   const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);

  //   const chainName = polygon
  //   const nexusClient = createSmartAccountClient({
  //     account: await toNexusAccount({
  //       signer: account,
  //       chain: chainName,
  //       transport: http(),
  //     }),
  //     transport: http(bundlerUrl),
  //     paymaster: createBicoPaymasterClient({ paymasterUrl }),
  //   });

  //   saAddress = await nexusClient.account.address;
  //   const datetime = new Date().toISOString();
  //   const contractAddress = envConfigs.contractAddress;
  //   const metadata = JSON.stringify({ 
  //     role:userExist.role,
  //     saAddress:userExist.saAddress, gameId:gameDetails.id,
  //     eventId:gameDetails.events[0].id
  //   });
  //   const iface = new ethers.utils.Interface(abi);
  //   const calldata = iface.encodeFunctionData("storeMetadata", [
  //     metadata,
  //     gameId,
  //   ]);


  //     //@ts-ignore
  //     const hash = await nexusClient.sendUserOperation({
  //       calls: [ 
  //         {
  //           to: contractAddress as `0x${string}`,
  //           value: 0n,
  //           abi: abi, // Provide the ABI array here
  //           functionName: 'storeMetadata',
  //           args: [metadata, gameId],
  //         },
  //       ], 
  //     });

  //    const receipt = await nexusClient.waitForUserOperationReceipt({ hash });
  //    console.log(receipt ,"receipttt................................................................")
  //   const transactionHash = receipt.receipt.transactionHash;
  //   const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
  //     gameId,
  //     userExist.id,
  //     id,
  //     transactionHash,
  //     chainName.name,
  //       "0",          
  //       );
  //         return res.status(200).json({
  //         status: true,
  //         message: "Event Fired Successfully",
  //         transactionDetails : saveTransactionDetails,
  //         user:userExist,
  //         timestamp: datetime
  //       })
  //   }     

  //   if(!userExist){
  //   userId = `user_${this.generateId()}`;
  //   const privKey = "0x" + sha512_256(userId)


  //   const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

  //   const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

  //   const wallet_address = await wallet.getAddress();
  //   const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);

  //   const chainName = polygon
  //   const nexusClient = createSmartAccountClient({
  //     account: await toNexusAccount({
  //       signer: account,
  //       chain: chainName,
  //       transport: http(),
  //     }),
  //     transport: http(bundlerUrl),
  //     paymaster: createBicoPaymasterClient({ paymasterUrl }),
  //   });

  //   saAddress = await nexusClient.account.address;
  //   const saveResult = await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);

  //   userExist = saveResult
  //   const datetime = new Date().toISOString();
  //   const contractAddress = envConfigs.contractAddress;
  //   const metadata = JSON.stringify({ 
  //     role:userExist.role,
  //     saAddress:userExist.saAddress, gameId:gameDetails.id,
  //     eventId:gameDetails.events[0].id
  //   });
  //   const iface = new ethers.utils.Interface(abi);
  //   const calldata = iface.encodeFunctionData("storeMetadata", [metadata,gameId]);

  //         //@ts-ignore
  //         const hash = await nexusClient.sendUserOperation({
  //           calls: [ 
  //             {
  //               to: contractAddress as `0x${string}`,
  //               value: 0n,
  //               abi: abi, // Provide the ABI array here
  //               functionName: 'storeMetadata',
  //               args: [metadata, gameId],
  //             },
  //           ], 
  //         });

  //   const receipt = await nexusClient.waitForUserOperationReceipt({ hash });

  //  const transactionHash = receipt.receipt.transactionHash;


  //   const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
  //   gameId,
  //   userExist.id,
  //   id,
  //   transactionHash,
  //   chainName.name,
  //   "0",          
  //   );
  //   return res.status(200).json({
  //     status: true,
  //     message: "Event Fired Successfully",
  //     transactionDetails : saveTransactionDetails,
  //     user:userExist,
  //     timestamp: datetime
  //   })
  // }
  //   } catch (error) {
  //     res.status(500).json({
  //       status: false,
  //       message: error.message || "Unexpected error occurred",
  //     })
  //   }
  // } 




static fireEvent = async (req: Request, res: Response): Promise<any> => {
  try {
    const eventId = req.params.eventId;
    const { gameId, id } = await dbservices.User.getGameid(eventId);
    
    if (!gameId || !id) {
      return res.status(400).json({status: false, message: "Invalid Game or Event ID"});
    }

    const eventCheck = await dbservices.User.eventCheck(gameId, eventId);
    if (!eventCheck) {
      return res.status(400).json({status: false, message: "Event does not exist for this game"});
    }

    const {devicedata} = req.body;
    if (!devicedata) {
      return res.status(400).json({status: false, message: "Device data is required"});
    }

    let userExist = await dbservices.User.userExits(devicedata);
    const gameDetails = await dbservices.User.getGameDetails(gameId, eventId);

    if (userExist) {
      if (gameDetails.creatorId === userExist.id) {
        return res.status(500).send({status: false, message: "Cannot fire event for own game"});
      }
    }

    const userId = userExist ? userExist.userId : `user_${this.generateId()}`;
    const datetime = new Date().toISOString();

    // If user doesn't exist, create them first
    if (!userExist) {
      const privKey = "0x" + sha512_256(userId);
      const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);
      const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
      const wallet_address = await wallet.getAddress();
      const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
      
      const chainName = polygon;
      const bundlerUrl = envConfigs.bundlerUrl;
      const paymasterUrl = envConfigs.paymaster_apikey_url;
      
      const nexusClient = createSmartAccountClient({
        account: await toNexusAccount({
          signer: account,
          chain: chainName,
          transport: http(),
        }),
        transport: http(bundlerUrl),
        paymaster: createBicoPaymasterClient({paymasterUrl}),
      });

      const saAddress = await nexusClient.account.address;
      userExist = await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);
    }
   
    const metadata = JSON.stringify({
      role: userExist?.role,
      gameId: gameDetails.id,
      eventId: gameDetails.events[0].id,
    });

    // **NEW: Add transaction to queue instead of global batch**
    const transactionId = transactionQueue.enqueue({
      userId,
      gameId,
      eventId: id,
      metadata,
      userData: userExist,
    });

    // Set up batch processing handler if not already set
    if (!transactionQueue['batchProcessorSet']) {
      transactionQueue['processSingleBatch'] = processBatch;
      transactionQueue['batchProcessorSet'] = true;
    }

    const stats = transactionQueue.getStats();
    console.log(`[ENQUEUED] TX: ${transactionId} | Event: ${eventId} | Game: ${gameId} | User: ${userId} | Total Queue: ${stats.queueSize}`);

    // **IMPROVED: Return 202 with transaction ID for status tracking**
    return res.status(202).json({
      status: true,
      message: "Event received and queued for processing",
      transactionId: transactionId,
      eventId: eventId,
      gameId: gameId,
      userId: userId,
      timestamp: datetime,
      queueStats: {
        positionInQueue: stats.pendingCount,
        totalPending: stats.pendingCount,
        activeProcessing: stats.processingCount,
      }
    });

  } catch (error) {
    console.log(`[ERROR] fireEvent failed: ${error}`);
    logger.error('Error in fireEvent:', error);
    res.status(500).json({
      status: false,
      message: error.message || "Unexpected error occurred",
    });
  }
};

/**
 * Get transaction status endpoint
 * Allows clients to poll for transaction completion status
 */
static getTransactionStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const transactionId = req.params.transactionId;
    
    if (!transactionId) {
      return res.status(400).json({
        status: false,
        message: "Transaction ID is required",
      });
    }

    const status = transactionQueue.getStatus(transactionId);
    
    if (!status) {
      return res.status(404).json({
        status: false,
        message: "Transaction not found",
      });
    }

    return res.json({
      status: true,
      transactionId,
      ...status,
    });

  } catch (error) {
    logger.error('Error in getTransactionStatus:', error);
    res.status(500).json({
      status: false,
      message: error.message || "Unexpected error occurred",
    });
  }
};

/**
 * Get queue statistics endpoint
 */
static getQueueStats = async (req: Request, res: Response): Promise<any> => {
  try {
    const stats = transactionQueue.getStats();
    console.log(`[STATS] Queue: ${stats.queueSize} | Pending: ${stats.pendingCount} | Processing: ${stats.processingCount} | Active: ${stats.activeParallel} | Nonce: ${stats.currentNonce}`);
    
    return res.json({
      status: true,
      stats,
    });

  } catch (error) {
    logger.error('Error in getQueueStats:', error);
    res.status(500).json({
      status: false,
      message: error.message || "Unexpected error occurred",
    });
  }
}

}
