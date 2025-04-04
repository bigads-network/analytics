import {Request, Response} from 'express';
import {privateKeyToAccount} from 'viem/accounts';
import {createWalletClient, http} from 'viem';
import {sha512_256} from 'js-sha512';
import {ethers} from 'ethers';
import {
    createSmartAccountClient,
    createBicoPaymasterClient,
    toNexusAccount,
} from '@biconomy/abstractjs';
import {chainIdToBundlerUrl, chainIdToChainName, envConfigs} from '../config/envconfig';
import {generateGameToken} from '../config/gameToken';
import dbservices from '../services/dbservices';
import {polygon, polygonAmoy} from 'viem/chains';
import { DuneClient } from "@duneanalytics/client-sdk";


// Global batch processing variables
const BATCH_SIZE = 3; // Process when we have 50 transactions total
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

// Helper function to process the global batch


export default class Test {
    static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

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



static allEventblockchain = async (req, res):Promise<any> => {
    try {

        const abi = [
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
        ]
        const provider = new ethers.providers.JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/demo");
        const contractAddress = envConfigs.contractAddress;
        const contract = new ethers.Contract(contractAddress, abi, provider);

        const latestBlock = await provider.getBlockNumber();
        const filter = contract.filters.MetadataStored();
        
        // Fetch all events (you can add query params for block range)
        const events = await contract.queryFilter(filter, 0, latestBlock);

        // Format response
        // const formattedEvents = events.map((event, index) => ({
        //     eventNumber: index + 1,
        //     blockNumber: event.blockNumber,
        //     transactionHash: event.transactionHash,
        //     sender: event.args.sender,
        //     gameId: event.args.gameId.toString(),
        //     metadata: event.args.metadata,
        //     fullEventData: {
        //         ...event,
        //         args: { // Explicitly include args to ensure serialization
        //             sender: event.args.sender,
        //             gameId: event.args.gameId.toString(),
        //             metadata: event.args.metadata
        //         }
        //     }
        // }));

        res.json({
            success: true,
            count: events.length,
            events: events
        });
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}


static dune = async (req:Request , res: Response):Promise<any> => {
    try {
        const dune = new DuneClient("G8yUpITJwWURW4nmaRDsuTqARSordceN");
        const query_result:any= await dune.getLatestResult({queryId: 4910363});
        res.status(200).json({ status: true,  count :query_result.result.rows.length ,data: query_result.result.rows });
        // res.status(200).json({status: true,count:query_result?.data.result.rows.length, data: query_result.data.result.rows});
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({status: false , message :"error fetching data "})
    }
}


static test = async(req:Request, res:Response):Promise<any>=>{
    try {
        const admin = envConfigs.adminId
        const adminAccountDetails = await dbservices.Creator.getdetails(admin);
        console.log(adminAccountDetails)
        res.status(200).json({ status: true,  data: adminAccountDetails });
        } catch (error) {
            console.error("API Error:", error);
            res.status(500).json({status: false , message :"error fetching data "})
    }
}


}