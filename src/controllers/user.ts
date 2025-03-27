import {Request , Response } from 'express';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { sha512_256 } from 'js-sha512';
import { ethers } from 'ethers';
// import { createSmartAccountClient, Paymaster, PaymasterMode,BiconomySmartAccountV2 } from '@biconomy/account';
import {
    createSmartAccountClient,
    createBicoPaymasterClient,
    toNexusAccount,
  } from '@biconomy/abstractjs';
import { chainIdToBundlerUrl, chainIdToChainName, envConfigs } from '../config/envconfig';
import { generateGameToken } from '../config/gameToken';
import dbservices from '../services/dbservices';
import { polygon, polygonAmoy } from 'viem/chains';

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

    static GetGameTransacttion = async(req:Request, res:Response):Promise<any>=>{
      try {
        const gameId = req.params.gameId 
        const transaction = await dbservices.User.getGameTransacttion(gameId)
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

  //   static fireEvent = async(req: Request, res: Response): Promise<any>=>{
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
  //   console.log("................................")
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

  //   if(userExist){
  //     console.log("......inside user exists")
  //   if(gameDetails.creatorId=== userExist.id){
  //       return res.status(500).send({ status:false ,message : "cannot fire event for own game "})
  //     }
  //     const chainId = parseInt(envConfigs.chainId);
  //     if (!chainId) {
  //         throw new Error("Missing or invalid chainId in environment variables");
  //     }
  //     userId =userExist.userId ;
  //     const privKey = "0x" + sha512_256(userId) ;

  //     const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

  //   const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

  //   const wallet_address = await wallet.getAddress();
  //   const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
  //   const chainName = chainIdToChainName[chainId];
  //   if (!chainName) {
  //       return res.status(500).json({ status: false, message: "Unsupported chainId" });
  //   }
  //   const client = createWalletClient({
  //     account,
  //     chain: chainName,
  //     transport: http(),
  //   });

  //   const bundlerUrl = chainIdToBundlerUrl[chainId];
  //   if (!bundlerUrl) {
  //       return res.status(500).json({ status: false, message: "Unsupported chainId for bundler" });
  //   }

  //   const smartAccount = await createSmartAccountClient({
  //     signer: client,
  //     bundlerUrl:bundlerUrl,
  //     biconomyPaymasterApiKey: envConfigs.paymaster_apikey,
  //   });

  //   saAddress = await smartAccount.getAccountAddress();
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
  //   const tx = {
  //     to: contractAddress,
  //     data: calldata,
  //     value: "0",
  //   };
  //   const txResponse = await smartAccount.sendTransaction(tx, {
  //     paymasterServiceData: {
  //       mode: PaymasterMode.SPONSORED,
  //     },
  //   });

  //   const userOpReceipt = await txResponse.wait();
  //   const transactionHash = userOpReceipt.receipt.transactionHash;

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
  //     const chainId = parseInt(envConfigs.chainId);
  //     if (!chainId) {
  //         throw new Error("Missing or invalid chainId in environment variables");
  //     }
  //   userId = `user_${this.generateId()}`;
  //   const privKey = "0x" + sha512_256(userId)


  //   const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

  //   const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

  //   const wallet_address = await wallet.getAddress();
  //   const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
  //   const chainName = chainIdToChainName[chainId];
  //   if (!chainName) {
  //       return res.status(500).json({ status: false, message: "Unsupported chainId" });
  //   }
  //   const client = createWalletClient({
  //   account,
  //   chain: chainName,
  //   transport: http(),
  //   });

  //   const bundlerUrl = chainIdToBundlerUrl[chainId];
  //   if (!bundlerUrl) {
  //       return res.status(500).json({ status: false, message: "Unsupported chainId for bundler" });
  //   }
  //   const smartAccount = await createSmartAccountClient({
  //   signer: client,
  //   bundlerUrl:bundlerUrl,
  //   biconomyPaymasterApiKey: envConfigs.paymaster_apikey,
  //   });

  //   saAddress = await smartAccount.getAccountAddress();
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
  //   const tx = {
  //   to: contractAddress,
  //   data: calldata,
  //   value: "0",
  //   };

  //   const txResponse = await smartAccount.sendTransaction(tx, {
  //   paymasterServiceData: {
  //   mode: PaymasterMode.SPONSORED,
  //   },
  //   });

  //   const userOpReceipt = await txResponse.wait();
  //   const transactionHash = userOpReceipt.receipt.transactionHash;

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

  static fireEvent = async(req: Request, res: Response): Promise<any>=>{
    try {
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
    const eventId = req.params.eventId
    const {gameId ,id } = await dbservices.User.getGameid(eventId)
    if(!gameId || !id){
      return res.status(400).json({ status: false, message: "Invalid Game or Event ID"});
    }
    const eventCheck = await dbservices.User.eventCheck(gameId ,eventId)
      if(!eventCheck){
        return res.status(400).json({ status: false, message: "Event does not exist for this game"});
      }
    const { devicedata } = req.body;
    if (!devicedata) {
            return res.status(400).json({ status: false, message: "Device data is required" });
        }
    let userExist = await dbservices.User.userExits(devicedata);
    let userId, saAddress ;
    const gameDetails = await dbservices.User.getGameDetails(gameId ,eventId)
    const bundlerUrl =envConfigs.bundlerUrl
    const paymasterUrl = envConfigs.paymaster_apikey_url
    if(userExist){
      if(gameDetails.creatorId=== userExist.id){
        return res.status(500).send({ status:false ,message : "cannot fire event for own game "})
      }
      // const chainId = parseInt(envConfigs.chainId);
      // if (!chainId) {
      //     throw new Error("Missing or invalid chainId in environment variables");
      // }
      userId =userExist.userId ;
      const privKey = "0x" + sha512_256(userId) ;

      const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

    const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

    const wallet_address = await wallet.getAddress();
    const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);

   

    // const chainName = chainIdToChainName[chainId];
    // if (!chainName) {
    //     return res.status(500).json({ status: false, message: "Unsupported chainId" });
    // }
    // const client = createWalletClient({
    //   account,
    //   chain: chainName,
    //   transport: http(),
    // });

    // const bundlerUrl = chainIdToBundlerUrl[chainId];
    // if (!bundlerUrl) {
    //     return res.status(500).json({ status: false, message: "Unsupported chainId for bundler" });
    // }

    // const smartAccount = await createSmartAccountClient({
    //   signer: client,
    //   bundlerUrl:bundlerUrl,
    //   biconomyPaymasterApiKey: envConfigs.paymaster_apikey,
    // });
    const chainName = polygon
    // console.log(bundlerUrl,paymasterUrl ,"................................................................")
    const nexusClient = createSmartAccountClient({
      account: await toNexusAccount({
        signer: account,
        chain: chainName,
        transport: http(),
      }),
      transport: http(bundlerUrl),
      paymaster: createBicoPaymasterClient({ paymasterUrl }),
    });

    saAddress = await nexusClient.account.address;
    const datetime = new Date().toISOString();
    const contractAddress = envConfigs.contractAddress;
    const metadata = JSON.stringify({ 
      role:userExist.role,
      saAddress:userExist.saAddress, gameId:gameDetails.id,
      eventId:gameDetails.events[0].id
    });
    const iface = new ethers.utils.Interface(abi);
    const calldata = iface.encodeFunctionData("storeMetadata", [
      metadata,
      gameId,
    ]);
    // const tx = {
    //   to: contractAddress,
    //   data: calldata,
    //   value: "0",
    // };

      //@ts-ignore
      const hash = await nexusClient.sendUserOperation({
        calls: [ 
          {
            to: contractAddress as `0x${string}`,
            value: 0n,
            abi: abi, // Provide the ABI array here
            functionName: 'storeMetadata',
            args: [metadata, gameId],
          },
        ], 
      });

     const receipt = await nexusClient.waitForUserOperationReceipt({ hash });

    const transactionHash = receipt.receipt.transactionHash;

    const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
      gameId,
      userExist.id,
      id,
      transactionHash,
      chainName.name,
        "0",          
        );
          return res.status(200).json({
          status: true,
          message: "Event Fired Successfully",
          transactionDetails : saveTransactionDetails,
          user:userExist,
          timestamp: datetime
        })
    }     

    if(!userExist){
      // const chainId = parseInt(envConfigs.chainId);
      // if (!chainId) {
      //     throw new Error("Missing or invalid chainId in environment variables");
      // }
    userId = `user_${this.generateId()}`;
    const privKey = "0x" + sha512_256(userId)


    const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

    const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

    const wallet_address = await wallet.getAddress();
    const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
    // const chainName = chainIdToChainName[chainId];
    // if (!chainName) {
    //     return res.status(500).json({ status: false, message: "Unsupported chainId" });
    // }

    const chainName = polygon
    const nexusClient = createSmartAccountClient({
      account: await toNexusAccount({
        signer: account,
        chain: chainName,
        transport: http(),
      }),
      transport: http(bundlerUrl),
      paymaster: createBicoPaymasterClient({ paymasterUrl }),
    });

    // const bundlerUrl = chainIdToBundlerUrl[chainId];
    // if (!bundlerUrl) {
    //     return res.status(500).json({ status: false, message: "Unsupported chainId for bundler" });
    // }
    // const smartAccount = await createSmartAccountClient({
    // signer: client,
    // bundlerUrl:bundlerUrl,
    // biconomyPaymasterApiKey: envConfigs.paymaster_apikey,
    // });

    saAddress = await nexusClient.account.address;
    const saveResult = await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);

    userExist = saveResult
    const datetime = new Date().toISOString();
    const contractAddress = envConfigs.contractAddress;
    const metadata = JSON.stringify({ 
      role:userExist.role,
      saAddress:userExist.saAddress, gameId:gameDetails.id,
      eventId:gameDetails.events[0].id
    });
    const iface = new ethers.utils.Interface(abi);
    const calldata = iface.encodeFunctionData("storeMetadata", [metadata,gameId]);
    // const tx = {
    // to: contractAddress,
    // data: calldata,
    // value: "0",
    // };

    
    // const txResponse = await smartAccount.sendTransaction(tx, {
    // paymasterServiceData: {
    // mode: PaymasterMode.SPONSORED,
    // },
    // });

          //@ts-ignore
          const hash = await nexusClient.sendUserOperation({
            calls: [ 
              {
                to: contractAddress as `0x${string}`,
                value: 0n,
                abi: abi, // Provide the ABI array here
                functionName: 'storeMetadata',
                args: [metadata, gameId],
              },
            ], 
          });

    const receipt = await nexusClient.waitForUserOperationReceipt({ hash });

   const transactionHash = receipt.receipt.transactionHash;

    // const userOpReceipt = await txResponse.wait();
    // const transactionHash = userOpReceipt.receipt.transactionHash;

    const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
    gameId,
    userExist.id,
    id,
    transactionHash,
    chainName.name,
    "0",          
    );
    return res.status(200).json({
      status: true,
      message: "Event Fired Successfully",
      transactionDetails : saveTransactionDetails,
      user:userExist,
      timestamp: datetime
    })
  }
    } catch (error) {
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      })
    }
  } 


  
  
  // static test =async(req:Request , res:Response )=>{
  //    try {
  //     const gameId = req.params.gameId
  //     const eventId = "event_TWSX1M9G"
  //     const gameDetails = await dbservices.User.getGameDetails(gameId ,eventId)
  //     const metadata = JSON.stringify(gameDetails)
  //     console.log(metadata)
  //     res.status(200).json({status: true, message: "Game details" ,detals: gameDetails})
  //    } catch (error) {
  //     res.status(500).json({status: false, message:"Unexpected error occurred"})
  //    }
  // }
}