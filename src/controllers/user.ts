import { Request, Response } from "express";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { sha512_256 } from "js-sha512";
import { ModularSdk, EtherspotBundler, sleep } from "@etherspot/modular-sdk";
import { ethers } from "ethers";
import {
  envConfigs,
} from "../config/envconfig";
import { generateGameToken } from "../config/gameToken";
import dbservices from "../services/dbservices";
import { polygon, polygonAmoy, xdc } from "viem/chains";
import logger from "../config/logger";

const BATCH_SIZE = 1; // Process when a user has 4 transactions
const BATCH_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// Structure to track global batch

let globalBatch: {
  transactions: {
    userId: string;
    gameId: number;
    eventId: number;
    metadata: string;
    userData: any;
  }[];
  timeout: NodeJS.Timeout | null;
  batchStartTime: number | null;
} = {
  transactions: [],
  timeout: null,
  batchStartTime: null,
};

// Helper function to process a single user's batch

async function processGlobalBatch() {
  if (globalBatch.transactions.length === 0) return;

  // Take a copy of the transactions and reset global batch
  const transactionsToProcess = [...globalBatch.transactions];
  globalBatch.transactions = [];
  if (globalBatch.timeout) {
    clearTimeout(globalBatch.timeout);
  }
  globalBatch.timeout = null;
  globalBatch.batchStartTime = null;

  try {
    // const admin = envConfigs.adminId
    // const adminAccountDetails = await dbservices.Creator.getdetails(admin);
    // if (!adminAccountDetails) {
    //     throw new Error("Admin account not found in database");
    // }
    // const privKey = sha512_256(adminAccountDetails.devicedata + adminAccountDetails.userId);
    const privKey = envConfigs.adminPrivatKey_Xdc;
    const rpcHttpProvider = new ethers.providers.JsonRpcProvider(
      envConfigs.provider_url_xdc
    );
    const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
    const wallet_address = await wallet.getAddress();
    const privateKey = wallet.privateKey;
    const chainName = xdc;

    const modularSdk = new ModularSdk(privKey, {
      chainId: 50, // XDC Mainnet
      bundlerProvider: new EtherspotBundler(
        50,
        envConfigs.etherspot_api_Key
      ),
    });
    const saAddress = await modularSdk.getCounterFactualAddress();
    console.log( "saAddressenvConfigs" ,envConfigs.adminPrivatKey_Xdc)
    console.log(`saAddress -->`, saAddress);
    console.log(`etherspot api key -->`, envConfigs.etherspot_api_Key);
    console.log(`contract Address -->`,envConfigs.contract_address_xdc );



    const contractAddress = envConfigs.contract_address_xdc;
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

    // const contractInterface = new ethers.utils.Interface(abi);
    // const decimals = 18;

     // Clear previous batch before starting new one
  // await modularSdk.clearUserOpsFromBatch();

  // const provider = new ethers.providers.JsonRpcProvider("https://rpc.xdc.org");
  const contractInterface = new ethers.Contract(contractAddress,abi,rpcHttpProvider)

    for (const tx of transactionsToProcess) {
      const callData = contractInterface.interface.encodeFunctionData("storeMetadata", [
        tx.userData.saAddress,
        tx.metadata,
        tx.gameId,
      ]);

    
      await modularSdk.addUserOpsToBatch({
        to: contractAddress,
        data: callData,
      });
    }
    

    // Prepare all calls for the batch
    //   const transactionData = erc20Instance.interface.encodeFunctionData(
    //     "transfer",
    //     [
    //       "0xB37aA61E082Df3E722e6994CbB720E85f13d53Da",
    //       ethers.utils.parseUnits("0", decimals),
    //     ]
    //   );

    //   // console.log(calls ,"call")

    //   // @ts-ignore
    //   await modularSdk.clearUserOpsFromBatch();
    //  await modularSdk.addUserOpsToBatch({
    //     to: contractAddress,
    //     data: transactionData,
    //     value: 0n,
    //   });

    const op = await modularSdk.estimate({
      paymasterDetails: {
        url: `https://arka.etherspot.io?apiKey=${envConfigs.etherspot_api_Key}&chainId=${Number(
          50
        )}&useVp=true`,
        context: { mode: "sponsor" },
      },
    });

    const uoHash = await modularSdk.send(op);
    console.log(`UserOpHash: ..........${uoHash}`);

    let userOpsReceipt = null;
    const timeout = Date.now() + 600000; // 1 minute timeout
    while (userOpsReceipt == null && Date.now() < timeout) {
      await sleep(2);
      const result = await modularSdk.getUserOpReceipt(uoHash);
      console.log("receipt................", result);
      userOpsReceipt = result;
    }
    // console.log("\x1b[33m%s\x1b[0m", `Transaction Receipt: `, userOpsReceipt);

    // Save all transactions in the batch
    for (const tx of transactionsToProcess) {
      await dbservices.User.saveTransactionDetails_XDC(
        tx.gameId,
        tx.userData.id,
        tx.eventId,
        userOpsReceipt,
        chainName.name,
        "0"
      );
    }

    logger.info(
      `Successfully processed ${transactionsToProcess.length} transactions in batch having ${userOpsReceipt}`
    );
  } catch (error) {
    console.error(`Error processing global batch:`, error);
    // Optionally implement retry logic for failed transactions
  }
}

export default class User {
  static generateId = () =>
    Math.random().toString(36).substr(2, 8).toUpperCase();

  static games = async (req: Request, res: Response): Promise<any> => {
    try {
      const games = await dbservices.User.getGames();
      return res.json({
        status: true,
        message: "Game List Fetched Successfully",
        data: games,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static events = async (req: Request, res: Response): Promise<any> => {
    try {
      const events = await dbservices.User.getEvents();
      return res.json({
        status: true,
        message: "Event List Fetched Successfully",
        data: events,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static self = async (req: Request, res: Response): Promise<any> => {
    try {
      const { devicedata } = req.body;
      const details = await dbservices.User.userExits(devicedata);
      return res.json({
        status: true,
        message: "Details Fetched Successfully",
        data: details,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static count = async (req: Request, res: Response): Promise<any> => {
    try {
      const count = await dbservices.User.counts();
      return res.json({
        status: true,
        message: "Details Fetched Successfully",
        data: count,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static transactions = async (req: Request, res: Response): Promise<any> => {
    try {
      const transaction = await dbservices.User.getTransactions();
      return res.json({
        status: true,
        message: "Transaction List Fetched Successfully",
        transactions: transaction.transactions,
        counts: transaction.counts[0].count,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

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

  static GetUserTransacttion = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const userId = req.params.userId;
      const transaction = await dbservices.User.getUserTransacttion(userId);
      return res.json({
        status: true,
        message: "Transaction List Fetched Successfully",
        transactions: transaction,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static eventTransaction = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const eventId = req.params.eventId;
      const transaction = await dbservices.User.geteventTransacttion(eventId);
      return res.json({
        status: true,
        message: "Transaction List Fetched Successfully",
        transactions: transaction,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

  static GetGameTransacttion = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const gameId = req.params.gameId;
      const transaction = await dbservices.User.getGameTransacttion(gameId);
      return res.json({
        status: true,
        message: "Transaction List Fetched Successfully",
        details: transaction,
      });
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };

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
        return res
          .status(400)
          .json({ status: false, message: "Invalid Game or Event ID" });
      }

      const eventCheck = await dbservices.User.eventCheck(gameId, eventId);
      if (!eventCheck) {
        return res.status(400).json({
          status: false,
          message: "Event does not exist for this game",
        });
      }

      if (req.body?.devicedata?.OS && typeof req.body.devicedata.OS === 'string') {
        req.body.devicedata.OS = `${req.body.devicedata.OS} XDC`;
      }
      
      const { devicedata } = req.body;
      if (!devicedata) {
        return res
          .status(400)
          .json({ status: false, message: "Device data is required" });
      }

      // console.log(devicedata)
      let userExist = await dbservices.User.userExits(devicedata);
      const gameDetails = await dbservices.User.getGameDetails(gameId, eventId);

      if (userExist) {
        if (gameDetails.creatorId === userExist.id) {
          return res
            .status(500)
            .send({ status: false, message: "Cannot fire event for own game" });
        }
      }

      const userId = userExist ? userExist.userId : `user_${this.generateId()}`;
      const datetime = new Date().toISOString();

      // If user doesn't exist, create them first
      if (!userExist) {
        // console.log("not exisssss")
        const privKey = "0x" + sha512_256(userId);
        // const privKey ="0x63a2075b2432ec19652761fa4d3c585bf5ccb6360c5a5666ebb2e2b63929cc41";
        const rpcHttpProvider = new ethers.providers.JsonRpcProvider(
          envConfigs.provider_url_xdc
        );
        const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
        const wallet_address = await wallet.getAddress();
        if (!rpcHttpProvider) {
          return res
            .status(500)
            .json({ status: false, message: "Error creating RPC provider" });
        }
        if (!wallet) {
          return res
            .status(500)
            .json({ status: false, message: "Error creating wallet" });
        }

        // console.log(wallet_address, "wallet_address");

        const chainName = xdc;

        const modularSdk = new ModularSdk(privKey, {
          chainId: 50, // XDC Mainnet
          bundlerProvider: new EtherspotBundler(
            50,
            "etherspot_3ZmG9JseTT1MD3v9QgPezHKB"
          ),
        });

        const saAddress = await modularSdk.getCounterFactualAddress();
        // console.log(saAddress ,"Account................................");
        // const saveResult = await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);

        // if (!saveResult) {
        //     throw new Error("Error saving user details");
        // }

        // userExist = saveResult;
        userExist = await dbservices.User.saveUser(
          userId,
          devicedata,
          saAddress,
          wallet_address
        );
      }

      const metadata = JSON.stringify({
        role: userExist?.role,
        // smartAccountAddress: userExist?.saAddress,
        gameId: gameDetails.id,
        eventId: gameDetails.events[0].id,
      });

      // Add transaction to global batch
      globalBatch.transactions.push({
        userId,
        gameId,
        eventId: id,
        metadata,
        userData: userExist,
      });

      // Start timer if this is the first transaction in batch
      if (globalBatch.transactions.length === 1) {
        globalBatch.batchStartTime = Date.now();
        globalBatch.timeout = setTimeout(() => {
          processGlobalBatch();
        }, BATCH_TIMEOUT_MS);
      }

      // Process immediately if batch size reached
      if (globalBatch.transactions.length >= BATCH_SIZE) {
        clearTimeout(globalBatch.timeout!);
        await processGlobalBatch();
      }

      // Calculate remaining time for response
      const remainingTime = globalBatch.batchStartTime
        ? BATCH_TIMEOUT_MS - (Date.now() - globalBatch.batchStartTime)
        : 0;

      logger.info(
        ` cuurrent batch size:${globalBatch.transactions.length} with remaining time: ${remainingTime}`
      );
      // Immediate response with tracking information
      return res.status(202).json({
        status: true,
        message: "Event received and being processed",
        eventId: eventId,
        gameId: gameId,
        userId: userId,
        timestamp: datetime,
        // batchInfo: {
        //   currentBatchSize: globalBatch.transactions.length,
        //   batchStartedAt: new Date(globalBatch.batchStartTime!).toISOString(),
        //   willProcessIn:
        //     globalBatch.transactions.length >= BATCH_SIZE
        //       ? "Immediately (batch size reached)"
        //       : `${Math.ceil(remainingTime / 1000)} seconds`,
        // },
      });
    } catch (error) {
      console.error("Error in fireEvent:", error);
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  };
}

