import {Request , Response } from 'express';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { sha512_256 } from 'js-sha512';
import { ethers } from 'ethers';
import {
    createSmartAccountClient,
    createBicoPaymasterClient,
    toNexusAccount,
  } from '@biconomy/abstractjs';
import { chainIdToBundlerUrl, chainIdToChainName, envConfigs } from '../config/envconfig';
import { generateGameToken } from '../config/gameToken';
import dbservices from '../services/dbservices';
import { polygon, polygonAmoy } from 'viem/chains';


const transactionQueue: Array<{
  userId: string;
  devicedata: any;
  gameId: number;
  eventId: number;
  gameDetails: any;
  userExist?: any;
  res?: Response;
}> = [];

let isProcessing = false;
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 2 * 60 * 1000; // 2 minutes

// ABI definition
const abi = [
  {
    type: "function",
    name: "storeMetadata",
    inputs: [
      {
        name: "metadata",
        type: "string",
        internalType: "string",
      },
      {
        name: "gameId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "MetadataStored",
    inputs: [
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "gameId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "metadata",
        type: "string",
        indexed: false,
        internalType: "string",
      },
    ],
    anonymous: false,
  },
];

// Background processor
async function processTransactionQueue() {
  if (isProcessing || transactionQueue.length === 0) return;
  
  isProcessing = true;
  // console.log(`[Queue Processor] Starting to process queue with ${transactionQueue.length} items`);
  
  try {
    while (transactionQueue.length > 0) {
      const batch = transactionQueue.splice(0, Math.min(BATCH_SIZE, transactionQueue.length));
      // console.log(`[Queue Processor] Processing batch of ${batch.length} transactions`);
      
      // Process the batch
      await processTransactionBatch(batch);
      
      // console.log(`[Queue Processor] Batch processed. Remaining in queue: ${transactionQueue.length}`);
      
      // Wait before processing next batch if there are more
      if (transactionQueue.length > 0) {
        // console.log(`[Queue Processor] Waiting ${BATCH_DELAY_MS/1000} seconds before next batch`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
  } catch (error) {
    // console.error('[Queue Processor] Error processing transaction queue:', error);
  } finally {
    isProcessing = false;
    console.log('[Queue Processor] Queue processing completed');
  }
}

async function processTransactionBatch(batch: any[]) {
  console.log(`[Batch Processor] Starting batch processing for ${batch.length} transactions`);
  
  const processingPromises = batch.map(async (item, index) => {
    const startTime = Date.now();
    // console.log(`[Batch Item ${index}] Starting processing for user ${item.userId}`);
    
    try {
      const { userId, devicedata, gameId, eventId, gameDetails, userExist } = item;
      
      // Generate private key
      // console.log(`[Batch Item ${index}] Generating private key for user ${userId}`);
      const privKey = "0x" + sha512_256(userId);
      
      // Set up provider and wallet
      // console.log(`[Batch Item ${index}] Setting up provider and wallet`);
      const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);
      const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
      const wallet_address = await wallet.getAddress();
      const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
      
      // console.log(`[Batch Item ${index}] Wallet address: ${wallet_address}`);
      
      // Create smart account client
      // console.log(`[Batch Item ${index}] Creating smart account client`);
      const chainName = polygon;
      const nexusClient = createSmartAccountClient({
        account: await toNexusAccount({
          signer: account,
          chain: chainName,
          transport: http(),
        }),
        transport: http(envConfigs.bundlerUrl),
        paymaster: createBicoPaymasterClient({ paymasterUrl: envConfigs.paymaster_apikey_url }),
      });

      const saAddress = await nexusClient.account.address;
      // console.log(`[Batch Item ${index}] Smart account address: ${saAddress}`);
      
      // Create new user if doesn't exist
      if (!userExist) {
        console.log(`[Batch Item ${index}] Creating new user record`);
         var newUserId =await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);
      }
      
      // Prepare transaction data
      // console.log(`[Batch Item ${index}] Preparing transaction data`);
      const contractAddress = envConfigs.contractAddress;
      const metadata = JSON.stringify({ 
        role: userExist?.role || 'user',
        saAddress,
        gameId: gameDetails.id,
        eventId: gameDetails.events[0].id
      });

      // console.log(`[Batch Item ${index}] Sending user operation`);
      //@ts-ignore
      const hash = await nexusClient.sendUserOperation({
        calls: [{
          to: contractAddress as `0x${string}`,
          value: 0n,
          abi: abi,
          functionName: 'storeMetadata',
          args: [metadata, gameId],
        }],
      });

      // console.log(`[Batch Item ${index}] User operation hash: ${hash}`);
      
      // Wait for receipt
      // console.log(`[Batch Item ${index}] Waiting for transaction receipt`);
      const receipt = await nexusClient.waitForUserOperationReceipt({ hash });
      const transactionHash = receipt.receipt.transactionHash;

      console.log(`[Batch Item ${index}] Transaction hash: ${transactionHash} with status  response ${receipt.success}`);
      console.log(`[Batch Item ${index}] Saving transaction details to DB`);
      const  data=await dbservices.User.saveTransactionDetails(
        gameId,
        userExist?.id || newUserId.id,
        eventId,
        transactionHash,
        chainName.name,
        "0"
      );
      
      console.log(`successfully done the transaction for ${data.id} for the gameId ${gameId} and userId${userExist?.id || userId}`);
      console.log(`[Batch Item ${index}] Transaction completed successfully in ${(Date.now() - startTime)/1000} seconds`);
      
      // Send success response if available
      // if (item.res) {
      //   item.res.status(200).json({
      //     status: true,
      //     message: "Event processed successfully",
      //     transactionHash,
      //     user: { ...(userExist || { userId, saAddress }),
      //     timestamp: new Date().toISOString()
      // }});
      // }
    } catch (error) {
      console.error(`[Batch Item ${index}] Error processing transaction:`, error);
      // if (item.res) {
      //   item.res.status(500).json({
      //     status: false,
      //     message: "Error processing transaction",
      //     error: error.message
      //   });
      // }
    }
  });

  console.log('[Batch Processor] Awaiting all batch promises');
  await Promise.all(processingPromises);
  console.log('[Batch Processor] Batch processing complete');
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
  //       return res.status(400).json({ status: false, message: "Event does not exist for this game"});
  //     }
  //   const { devicedata } = req.body;
  //   if (!devicedata) {
  //           return res.status(400).json({ status: false, message: "Device data is required" });
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
    console.log()
     const eventId = req.params.eventId;     
     const { gameId, id } = await dbservices.User.getGameid(eventId);
     console.log(`[Event Controller] Processing event ID: ${eventId}`);
     if (!gameId || !id) {
       return res.status(400).json({ status: false, message: "Invalid Game or Event ID" });
     }

     const eventCheck = await dbservices.User.eventCheck(gameId, eventId);
     if (!eventCheck) {
       return res.status(400).json({ status: false, message: "Event does not exist for this game" });
     }

     const { devicedata } = req.body;
     if (!devicedata) {
       return res.status(400).json({ status: false, message: "Device data is required" });
     }

     const gameDetails = await dbservices.User.getGameDetails(gameId, eventId);
     let userExist = await dbservices.User.userExits(devicedata);

     if (userExist && gameDetails.creatorId === userExist.id) {
       return res.status(500).send({ status: false, message: "Cannot fire event for own game" });
     }

     // Create queue item
     const queueItem = {
       userId: userExist ? userExist.userId : `user_${this.generateId()}`,
       devicedata,
       gameId,
       eventId: id,
       gameDetails,
       userExist,
       res
     };

     // Add to queue
     console.log(`[Event Controller] Adding event to queue. Queue size: ${transactionQueue.length + 1}`);
     transactionQueue.push(queueItem);

     // Start processing if not already running
     if (!isProcessing) {
      //  console.log('[Event Controller] Starting queue processor');
       processTransactionQueue().catch(console.error);
     }

    //  console.log('[Event Controller] Sending 202 accepted response');
     return res.status(200).json({
       status: true,
       message: "Event submitted successfully  ",
       // queuePosition: transactionQueue.length,
       timestamp: new Date().toISOString()
     });

   } catch (error) {
     return res.status(500).json({
       status: false,
       message: error.message || "Unexpected error occurred",
     });
   }
 };

}
