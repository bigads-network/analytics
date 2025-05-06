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



// static allEventblockchain = async (req, res):Promise<any> => {
//     try {

//         const ABI = [
//             {
//               anonymous: false,
//               inputs: [
//                 { indexed: true, internalType: "address", name: "user", type: "address" },
//                 { indexed: true, internalType: "uint256", name: "gameId", type: "uint256" },
//                 { indexed: false, internalType: "string", name: "metadata", type: "string" },
//               ],
//               name: "MetadataStored",
//               type: "event",
//             }
//           ];
//         const CONTRACT_ADDRESS = envConfigs.contractAddress;
//         const provider = new ethers.providers.JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/demo");
//         const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
//         const filter = contract.filters.MetadataStored();
//         const latestBlock = await provider.getBlockNumber();
//         const events = await contract.queryFilter(filter, 0, latestBlock);
    
//         const formattedEvents = events.map((event) => ({
//             user: event.args?.user,
//             gameId: event.args?.gameId.toString(),
//             metadata: event.args?.metadata,
//             blockNumber: event.blockNumber,
//             transactionHash: event.transactionHash,
//           }));
      
//           res.json({ success: true, count: events.length ,events:events });
      
//     } catch (error) {
//         console.error("API Error:", error);
//         res.status(500).json({
//             success: false,
//             error: error.message
//         });
//     }
// }

static allEventblockchain = async (req, res): Promise<any> => {
    try {
        const ABI = [
            {
              anonymous: false,
              inputs: [
                { indexed: true, internalType: "address", name: "user", type: "address" },
                { indexed: true, internalType: "uint256", name: "gameId", type: "uint256" },
                { indexed: false, internalType: "string", name: "metadata", type: "string" },
              ],
              name: "MetadataStored",
              type: "event",
            }
          ];      
        const CONTRACT_ADDRESS = envConfigs.contractAddress;
        const provider = new ethers.providers.JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/demo");
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        
        const days = parseInt(req.query.days as string) || 30;
        const endBlock = await provider.getBlockNumber();
        const endBlockData = await provider.getBlock(endBlock);
        const startTimestamp = endBlockData.timestamp - (days * 24 * 60 * 60);
        const startBlock = Math.max(0, endBlock - Math.floor(days * 6500));
        
        const filter = contract.filters.MetadataStored();
        const events = await contract.queryFilter(filter, startBlock, endBlock);
        
        // Group by day/hour for the graph
        const dailyStats: Record<string, number> = {};
        
        // Need to fetch block timestamps (this might be slow - consider using a service like The Graph)
        for (const event of events) {
            const block = await provider.getBlock(event.blockNumber);
            const date = new Date(block.timestamp * 1000);
            const dayKey = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
            
            dailyStats[dayKey] = (dailyStats[dayKey] || 0) + 1;
        }
        
        // Convert to array format for charts
        const graphData = Object.entries(dailyStats).map(([date, count]) => ({
            date,
            count
        }));
        
        res.json({ 
            success: true, 
            data: graphData 
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
        const dune = new DuneClient(envConfigs.duneApikey);
        // const query_result:any= await dune.getLatestResult({queryId: 4910363}); // all data
        const query_result:any= await dune.getLatestResult({queryId: 5084990}); // Active user
        res.status(200).json({ status: true,  count :query_result.result.rows.length ,data: query_result.result.rows });
        // res.status(200).json({status: true,count:query_result?.data.result.rows.length, data: query_result.data.result.rows});
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({status: false , message :"error fetching data "})
    }
}


static duneEventsdata = async (req:Request , res: Response):Promise<any> => {
    try {
        const dune = new DuneClient(envConfigs.duneApikey);
        const query_result:any= await dune.getLatestResult({queryId: 5084986}); // all data
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

static totalTransactionsperdat = async(req:Request , res:Response):Promise<any>=>{
    try {
    const startdateString = req.query.startdate as string;
    const endDateString = req.query.endDate as string
    if (!startdateString||!endDateString ) {
        return res.status(400).json({
            success: false,
            message: 'Date parameter is required (format: YYYY-MM-DD)'
        });
    }
            
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startdateString)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid date format. Please use YYYY-MM-DD'
        });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateString)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid date format. Please use YYYY-MM-DD'
        });
    }

    // Parse the date (will be interpreted as local time)
    const startdate = new Date(startdateString); // Pass the date you want to query
    const iststartDate = new Date(startdate.getTime() - 5.5 * 60 * 60 * 1000);
    
    const endDate = new Date(endDateString)
    const istendDate = new Date(endDate.getTime() - 5.5 * 60 * 60 * 1000);
    console.log(iststartDate ,istendDate ,"time")
    // const count = await dbservices.User.perDayTransactions(date);
    // "2025-04-09T02:00:00", // Start: April 9, 2 AM IST
    // "2025-04-10T10:00:00"  // End: April 10, 10 AM IST
    const startTime="2025-04-09T02:00:00" ;
    const endTime= "2025-04-10T14:00:00" ;
    const count = await dbservices.User.perDayTransactions(startTime , endTime);
    return res.status(200).json({
        success: true,
        count: {
            startdate: startdateString,
            endDate:endDateString,
            transactionCount: count
        }
    });        
    } catch (error) {
        res.status(500).json({status: false , message :"error fetching data "})

    }
}

}