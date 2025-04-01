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


const BATCH_SIZE = 50; // Process when a user has 4 transactions
const BATCH_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// Structure to track each user's batch and timeout
interface UserBatch {
    transactions: {
        userId: string;
        gameId: number;
        eventId: number;
        metadata: string;
        userData: any;
    }[];
    timeout: NodeJS.Timeout | null;
}

const userBatches: Record<string, UserBatch> = {};

// Helper function to process a single user's batch
async function processUserBatch(userId: string) {
    const userBatch = userBatches[userId];
    if (!userBatch || userBatch.transactions.length === 0) return;

    // Take a copy of the transactions and clear the user's batch
    const transactionsToProcess = [...userBatch.transactions];
    userBatch.transactions = [];
    userBatch.timeout = null;

    try {
        const firstTx = transactionsToProcess[0];
        const privKey = "0x" + sha512_256(userId);
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
            paymaster: createBicoPaymasterClient({paymasterUrl}),
        });

        const contractAddress = envConfigs.contractAddress;
        const abi = [
            {
                type: "function",
                name: "storeMetadata",
                inputs: [
                    { name: "metadata", type: "string", internalType: "string" },
                    { name: "gameId", type: "uint256", internalType: "uint256" },
                ],
                outputs: [],
                stateMutability: "nonpayable",
            },
            {
                type: "event",
                name: "MetadataStored",
                inputs: [
                    { name: "sender", type: "address", indexed: true, internalType: "address" },
                    { name: "gameId", type: "uint256", indexed: true, internalType: "uint256" },
                    { name: "metadata", type: "string", indexed: false, internalType: "string" },
                ],
                anonymous: false,
            },
        ];

        // Prepare all calls for this user
        const calls = transactionsToProcess.map(tx => ({
            to: contractAddress as `0x${string}`,
            value: 0n,
            abi: abi,
            functionName: 'storeMetadata',
            args: [tx.metadata, tx.gameId],
        }));
        
        // @ts-ignore
        const hash = await nexusClient.sendUserOperation({
            calls: calls,
        });

        const receipt = await nexusClient.waitForUserOperationReceipt({hash});
        const transactionHash = receipt.receipt.transactionHash;

        // Save all transactions for this user
        for (const tx of transactionsToProcess) {
            await dbservices.User.saveTransactionDetails(
                tx.gameId,
                tx.userData.id,
                tx.eventId,
                transactionHash,
                chainName.name,
                "0",
            );
        }
    
        console.log(`Successfully processed ${transactionsToProcess.length} transactions for user ${userId}`);
    } catch (error) {
        console.error(`Error processing batch for user ${userId}:`, error);
        // You might want to implement retry logic or error reporting here
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
        const {gameId, id} = await dbservices.User.getGameid(eventId);
        
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

        // Prepare metadata with unique hash for each event
        const metadata = JSON.stringify({
            role: userExist?.role,
            saAddress: userExist?.saAddress,
            gameId: gameDetails.id,
            eventId: gameDetails.events[0].id,
        });

        // If user doesn't exist, create them first (synchronously since we need the user data)
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

        // Initialize user's batch if it doesn't exist
        if (!userBatches[userId]) {
            userBatches[userId] = {
                transactions: [],
                timeout: null
            };
        }

        const userBatch = userBatches[userId];

        // Add transaction to user's batch
        userBatch.transactions.push({
            userId,
            gameId,
            eventId: id,
            metadata,
            userData: userExist
        });

        // Clear existing timeout if it exists
        if (userBatch.timeout) {
            clearTimeout(userBatch.timeout);
        }

        // Set new timeout for this user's batch
        userBatch.timeout = setTimeout(() => {
            processUserBatch(userId).finally(() => {
                if (userBatches[userId] && userBatches[userId].transactions.length === 0) {
                    delete userBatches[userId];
                }
            });
        }, BATCH_TIMEOUT_MS);

        // Process immediately if batch size reached
        if (userBatch.transactions.length >= BATCH_SIZE) {
            clearTimeout(userBatch.timeout);
            processUserBatch(userId).finally(() => {
                if (userBatches[userId] && userBatches[userId].transactions.length === 0) {
                    delete userBatches[userId];
                }
            });
        }

        // Immediate response with tracking information
        return res.status(202).json({
            status: true,
            message: "Event submitted  successfully",
            eventId: eventId,
            // gameId: gameId,
            userId: userId,
            timestamp: datetime,
            // batchInfo: {
            //     currentUserBatchSize: userBatch.transactions.length,
            //     willProcessAt: userBatch.transactions.length >= BATCH_SIZE 
            //         ? "Immediately (batch size reached)"
            //         : `Within ${BATCH_TIMEOUT_MS/1000} seconds if no more events`
            // }
        });

    } catch (error) {
        console.error('Error in fireEvent:', error);
        res.status(500).json({
            status: false,
            message: error.message || "Unexpected error occurred",
        });
    }
}

}
