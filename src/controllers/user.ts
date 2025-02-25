import {Request , Response } from 'express';
import dbservices from '../services/dbservices';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { generateAuthTokens } from '../config/token';
import DiamSdk from "diamnet-sdk"
import axios from 'axios';
import { sha512_256 } from 'js-sha512';
import { ethers } from 'ethers';
import { createSmartAccountClient, Paymaster } from '@biconomy/account';
import { chainIdToBundlerUrl, chainIdToChainName, providerUrl } from '../config/envconfig';



export default class User{



  // static tokenTest = async(req: Request, res: Response): Promise<any> => {
  //   try {
  //     const gameApiKey = req.headers['game_apikey'] as string;

  //     // Check if the gameApiKey is missing
  //     if (!gameApiKey) {
  //       return res.status(400).json({ status: false, message: 'Missing gameApiKey in headers.' });
  //     }
  
  //     // Compare the provided gameApiKey with the static key in the environment
  //     const staticGameApiKey = process.env.GAME_API_KEY;
  //     if (gameApiKey !== staticGameApiKey) {
  //       return res.status(403).json({ status: false, message: 'Invalid gameApiKey.' });
  //     }     
  //      return res.status(200).json({ status: true, message: "Token Test Passed", user:gameApiKey});
  //   } catch (error) {
  //     console.error("Error in tokenTest:", error);
  //     return res.status(500).json({ status: false, message: "Error processing request" });
  //   }
  // }

   static requestCreator = async(req:Request, res:Response):Promise<any> => {
    try {
      const { maAddress, userRole, id } = req.body;
      
      // Check if user exists
      const user = await dbservices.User.userExists(maAddress);
      if (!user) {
        return res.status(404).json({ status: false, message: "User not found" });
      }

      // Check if user already has a pending request
      const existingRequest = await dbservices.User.getCreatorRequest(id);
      if (existingRequest) {
        if (existingRequest.status === 'pending') {
          return res.status(400).json({ 
            status: false, 
            message: "You already have a pending creator request" 
          });
        } else if (existingRequest.status === 'fulfilled') {
          return res.status(400).json({ 
            status: false, 
            message: "You are already a creator" 
          });
        }
      }

      // Create new creator request
      const creatorRequest = await dbservices.User.createCreatorRequest(id, maAddress, userRole);
      if (!creatorRequest) {
        return res.status(404).json({ 
          status: false, 
          message: "Failed to create creator request" 
        });
      }

      return res.status(200).json({ 
        status: true, 
        message: "Creator request created", 
        data: creatorRequest 
      });
      
    } catch (error) {
      return res.status(500).json({ 
        status: false, 
        message: error.message || "Unexpected error occurred" 
      });
    }
   }

    static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

    // static registerUser: any = async (req: Request, res: Response) => {
    //   try {
  
    //     const { appId, deviceId, maAddress } = req.body;
    //     if (!appId || !deviceId || !maAddress) {
    //       return res.status(400).json({ status: false, message: "Missing required fields: appId, deviceId, maAddress" });
    //     }
        
    //     let userExist = await dbservices.User.userExists(maAddress);
  
    //     let message = "User Logged In";
    //     let userId, saAddress;
       

    //     if (!userExist) {
    //       const chainId = parseInt(process.env.CHAINID || "80002");
    //       if (!chainId) {
    //         throw new Error("Missing or invalid chainId in environment variables");
    //       }
  
    //       userId = await `user_${this.generateId()}`;  
    //       const privKey = sha512_256(appId + deviceId + userId);  
    //       const rpcHttpProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
    //       if (!rpcHttpProvider) {
    //         return res.status(500).json({ status: false, message: "Error creating RPC provider" });
    //       }
  
    //       const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
    //       console.log(wallet,"wallet");
    //       if (!wallet) {
    //         return res.status(500).json({ status: false, message: "Error creating wallet" });
    //       }
  
    //       const account:any = privateKeyToAccount(wallet.privateKey as any);
    //       const chainName = chainIdToChainName[chainId];
    //       const client = createWalletClient({
    //         account,
    //         chain: chainName,
    //         transport: http(),
    //       });
  
    //       const eoa = client.account.address;
  
    //       const bundlerUrl = chainIdToBundlerUrl[chainId];
    //       const Paymaster_key = process.env.PAYMASTERAPI_KEY

    //       const smartAccount = await createSmartAccountClient({
    //         signer: client,
    //         bundlerUrl,
    //         chainId,
    //         biconomyPaymasterApiKey:Paymaster_key
    //       });
    //       saAddress = await smartAccount.getAccountAddress();
  
    //       const saveResult = await dbservices.User.saveDetails(userId, appId, deviceId, saAddress,maAddress);
    //       console.log(saveResult, "saveResult");
    //       if (!saveResult) {
    //         throw new Error("Error saving user details");
    //       }
  
    //       userExist = saveResult;
    //       message = "User registered Successfully";
    //     }
  
    //     // console.log(userExist.id)
    //     const token = await generateAuthTokens({userId:userExist.id , role:userExist.role });
  
    //     return res.status(200).send({
    //       message,
    //       data: {id : userExist.id, userId: userExist.userId, role : userExist.role , appId, deviceId, saAddress: userExist.saAddress, maAddress: userExist.maAddress },
    //       token,
    //     });
    //   } catch (error: any) {
    //     console.error("Unexpected error:", error);
    //     return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
    //   }
    // };

    static registerUser: any = async (req: Request, res: Response) => {
      try {
          const { appId, deviceId, maAddress } = req.body;
          const walletAddress = maAddress || '';
  
          let userExist, message = "User Logged In", userId, saAddress, token;
  
          if (walletAddress.startsWith('0x')) {
              // Ethereum-based flow
              if (!appId || !deviceId || !maAddress) {
                  return res.status(400).json({ 
                      status: false, 
                      message: "Missing required fields: appId, deviceId, maAddress" 
                  });
              }
  
              userExist = await dbservices.User.userExists(maAddress);
  
              if (!userExist) {
                  const chainId = parseInt(process.env.CHAINID || "80002");
                  if (!chainId) {
                      throw new Error("Missing or invalid chainId in environment variables");
                  }
  
                  userId = `user_${this.generateId()}`;  
                  const privKey = sha512_256(appId + deviceId + userId);  
                  const rpcHttpProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
                  if (!rpcHttpProvider) {
                      return res.status(500).json({ status: false, message: "Error creating RPC provider" });
                  }
  
                  const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
                  if (!wallet) {
                      return res.status(500).json({ status: false, message: "Error creating wallet" });
                  }
  
                  const account: any = privateKeyToAccount(wallet.privateKey as any);
                  const chainName = chainIdToChainName[chainId];
                  const client = createWalletClient({
                      account,
                      chain: chainName,
                      transport: http(),
                  });
  
                  const eoa = client.account.address;
                  const bundlerUrl = chainIdToBundlerUrl[chainId];
                  const Paymaster_key = process.env.PAYMASTERAPI_KEY;
  
                  const smartAccount = await createSmartAccountClient({
                      signer: client,
                      bundlerUrl,
                      chainId,
                      biconomyPaymasterApiKey: Paymaster_key
                  });
                  saAddress = await smartAccount.getAccountAddress();
  
                  const saveResult = await dbservices.User.saveDetails(userId, appId, deviceId, saAddress, maAddress);
                  if (!saveResult) {
                      throw new Error("Error saving user details");
                  }
  
                  userExist = saveResult;
                  message = "User registered Successfully";
              }
  
              token = await generateAuthTokens({userId: userExist.id, role: userExist.role});
  
              return res.status(200).send({
                  message,
                  data: { 
                      id: userExist.id,
                      userId: userExist.userId, 
                      role: userExist.role, 
                      appId, 
                      deviceId, 
                      saAddress: userExist.saAddress, 
                      maAddress: userExist.maAddress 
                  },
                  token,
              });
          } else {
              // Diamante-based flow
              if (!appId || !deviceId) {
                  return res.status(400).json({
                      status: false,
                      message: "Missing required fields: appId, deviceId",
                  });
              }
  
              userExist = await dbservices.User.userExists(maAddress);
              
              if (!userExist) {
                  userId = `user_${this.generateId()}`;
                  const privKey = this.stringToRawEd25519Seed(appId + deviceId + userId);
                  const diamnetKeypair = DiamSdk.Keypair.fromRawEd25519Seed(privKey);
                  saAddress = diamnetKeypair.publicKey();
                  await axios.get(`https://friendbot.diamcircle.io/?addr=${saAddress}`);
  
                  const saveResult = await dbservices.User.saveDetails(userId, appId, deviceId, saAddress, maAddress);
                  if (!saveResult) {
                      throw new Error("Error saving user details");
                  }
                  userExist = saveResult;
                  message = "User registered Successfully";
              }
  
              token = await generateAuthTokens({
                  userId: userExist.id,
                  role: userExist.role,
              });
  
              return res.status(200).send({
                  message,
                  data: {
                      id: userExist.id,
                      userId: userExist.userId,
                      role: userExist.role,
                      appId,
                      deviceId,
                      saAddress: userExist.saAddress,
                      maAddress: userExist.maAddress 
                  },
                  token,
              });
          }
      } catch (error: any) {
          console.error("Unexpected error:", error);
          return res.status(500).json({ 
              status: false, 
              message: error.message || "Unexpected error occurred" 
          });
      }
  };

    static registerOwner: any = async (req: Request, res: Response) => {
      try {
        // console.log("registerUser request body:", req.body);
  
        const { secret_key, deviceId } = req.body;
        
         
        
        if (!secret_key || !deviceId ) {
          return res.status(400).json({ status: false, message: "Missing required fields: appId, deviceId" });
        }

        const secretkey = process.env.owner_Secret_key
        console.log(secretkey, secret_key)
        if(secret_key!==secretkey){
          return res.status(403).json({ status: false, message: 'Invalid secret key.' });
        }
  
        let userExist = await dbservices.User.userExists(deviceId, secret_key);
  
        let message = "User Logged In";
        let userId, saAddress;
  
        if (!userExist) {
          const chainId = parseInt(process.env.CHAINID || "80002");
          if (!chainId) {
            throw new Error("Missing or invalid chainId in environment variables");
          }
  
          userId = await `user_${this.generateId()}`;
          // console.log("Generated userId:", userId);
  
          const privKey = sha512_256(secret_key + deviceId + userId);
          // console.log("Generated private key:", privKey);
  
          const rpcHttpProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
          if (!rpcHttpProvider) {
            return res.status(500).json({ status: false, message: "Error creating RPC provider" });
          }
  
          const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
          if (!wallet) {
            return res.status(500).json({ status: false, message: "Error creating wallet" });
          }
  
          const account:any = privateKeyToAccount(wallet.privateKey as any);
          const chainName = chainIdToChainName[chainId];
          const client = createWalletClient({
            account,
            chain: chainName,
            transport: http(),
          });
  
          const eoa = client.account.address;
          // console.log(`EOA address: ${eoa}`);
  
          const bundlerUrl = chainIdToBundlerUrl[chainId];
          // console.log("Bundler URL:", bundlerUrl);
          const Paymaster_key = process.env.PAYMASTERAPI_KEY

          const smartAccount = await createSmartAccountClient({
            signer: client,
            bundlerUrl,
            chainId,
            biconomyPaymasterApiKey:Paymaster_key
          });
         // console.log(smartAccount ,"smart account")
          saAddress = await smartAccount.getAccountAddress();
          // console.log("Smart Account Address:", saAddress);
  
          const saveResult = await dbservices.User.saveDetailsOwner(userId, secret_key, deviceId, saAddress);
          if (!saveResult) {
            throw new Error("Error saving user details");
          }
  
          userExist = saveResult;
          // console.log(userExist ,"user registered");
          message = "User registered Succesfully";
        }
  
        // console.log(userExist.id)
        const token = await generateAuthTokens({userId:userExist.id , role:userExist.role });
        // console.log("Generated token:", token);
  
        return res.status(200).send({
          message,
          data: { userId: userExist.userId, role : userExist.role , secret_key, deviceId, saAddress: userExist.saAddress },
          token,
        });
      } catch (error: any) {
        console.error("Unexpected error:", error);
        return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
      }
    };
  

    static registerGame: any = async (req: Request, res: Response): Promise<any> => {
      const { name, type, description, events, wallet_address } = req.body;

      try {
          const userId = req['user'].userId;
          const role = req['user'].role;
          
          if (role !== 'creator' && role !== 'admin') {
              throw new Error("Invalid role");
          }
          const gameData = req.body;
          let gameExist = await dbservices.User.gameExists(userId, gameData.name, gameData.type);
          if (!gameData || !gameData.events || !Array.isArray(gameData.events)) {
              return res.status(400).json({ message: 'Invalid game data or events.' });
          }
          let message = "Game Already exists";
          let saAddress;
          
          // const walletAddress = req.body.walletAddress || '';
          // console.log(walletAddress, "walletAddress")
  
          if (wallet_address.startsWith('0x')) {
              // Original Ethereum-based flow
              if (!gameExist) {
                  const chainId = parseInt(process.env.CHAINID || "80002");
                  if (!chainId) {
                      throw new Error("Missing or invalid chainId in environment variables");
                  }
                  
                  const gameId = `game_${this.generateId()}`;
                  const privKey = sha512_256(gameData + gameId + userId);
                  
                  const rpcHttpProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
                  if (!rpcHttpProvider) {
                      return res.status(500).json({ status: false, message: "Error creating RPC provider" });
                  }
  
                  const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
                  if (!wallet) {
                      return res.status(500).json({ status: false, message: "Error creating wallet" });
                  }
  
                  const account: any = privateKeyToAccount(wallet.privateKey as any);
                  const chainName = chainIdToChainName[chainId];
                  const client = createWalletClient({
                      account,
                      chain: chainName,
                      transport: http(),
                  });
  
                  const eoa = client.account.address;
                  const bundlerUrl = chainIdToBundlerUrl[chainId];
                  const Paymaster_key = process.env.PAYMASTERAPI_KEY;
  
                  const smartAccount = await createSmartAccountClient({
                      signer: client,
                      bundlerUrl,
                      chainId,
                      biconomyPaymasterApiKey: Paymaster_key
                  });
  
                  saAddress = await smartAccount.getAccountAddress();
  
                  const saveResult = await dbservices.User.registerGame(userId, gameId, gameData, saAddress);
                  if (!saveResult) {
                      throw new Error("Error saving user details");
                  }
  
                  gameExist = saveResult;
                  message = "Game registered Successfully";
              }
          } else {
              // Diamante-based flow
              if (!gameExist) {
                  const gameId = `game_${this.generateId()}`;
                  const privKey = this.stringToRawEd25519Seed(gameData + gameId + userId);
                  const diamnetKeypair = DiamSdk.Keypair.fromRawEd25519Seed(privKey);
                  saAddress = diamnetKeypair.publicKey();
                  const saAddress_secret = diamnetKeypair.secret();
                  
                  await axios.get(`https://friendbot.diamcircle.io/?addr=${saAddress}`);
  
                  const saveResult = await dbservices.User.registerGame(userId, gameId, gameData, saAddress);
                  if (!saveResult) {
                      throw new Error("Error saving user details");
                  }
                  
                  gameExist = saveResult;
                  message = "Game registered Successfully";
              }
          }
  
          return res.status(201).json({ message: message, data: gameExist });
      } catch (error: any) {
          return res.status(500).json({ 
              status: false, 
              message: error.message || "Unexpected error occurred" 
          });
      }
  }

    
    static eventCreation = async(req:Request, res:Response):Promise<any> => {
        try {
          const userId = req['user'].userId;
          const role = req['user'].role;
          if(role !== 'creator') {
            throw new Error(" should be creator of the game")
          }
          const gameId = req.params.gameId;
          const checkExist = await dbservices.User.checkGameExists(userId, gameId)
          if(checkExist.length===0){
            throw new Error("game not found for paricular creator")
          }
          const {eventType} = req.body
          const checkevent = await dbservices.User.checkevent(gameId,eventType)
          console.log(checkevent ,"wertyu")
          if(checkevent.length > 0){
            throw new Error("already registered event")
          }
          const createEvent = await dbservices.User.createEvent( gameId ,eventType)
          res.status(200).send({status: true , message:"Event created" , event : createEvent})
        } catch (error:any) {
          res.status(500).json({ status: false, message: error.message})
          
        }
    }

    static sendEvents = async (req: Request, res: Response): Promise<any> => {
      const { deviceId, appId, eventId, gameId, wallet_address } = req.body;
      try {
          let userId: string | null = null;
          let token, saAddress;
          
          if (wallet_address.startsWith('0x')) {
              // Original Ethereum-based flow
              if (req["user"] === null) {
                  const { appId, deviceId } = req.body;
                  if (!appId || !deviceId) {
                      return res.status(400).json({
                          status: false,
                          message: "Missing required fields: appId, deviceId",
                      });
                  }
  
                  let userExist = await dbservices.User.userExists(deviceId, appId);
                  if (!userExist) {
                      const chainId = parseInt(process.env.CHAINID || "80002");
                      if (!chainId) {
                          throw new Error("Missing or invalid chainId in environment variables");
                      }
  
                      userId = `user_${this.generateId()}`;
                      const privKey = sha512_256(appId + deviceId + userId);
                      const rpcHttpProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
                      if (!rpcHttpProvider) {
                          return res.status(500).json({ status: false, message: "Error creating RPC provider" });
                      }
  
                      const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
                      if (!wallet) {
                          return res.status(500).json({ status: false, message: "Error creating wallet" });
                      }
  
                      const account: any = privateKeyToAccount(wallet.privateKey as any);
                      const chainName = chainIdToChainName[chainId];
                      const client = createWalletClient({
                          account,
                          chain: chainName,
                          transport: http(),
                      });
  
                      const eoa = client.account.address;
                      const bundlerUrl = chainIdToBundlerUrl[chainId];
                      const Paymaster_key = process.env.PAYMASTERAPI_KEY;
  
                      const smartAccount = await createSmartAccountClient({
                          signer: client,
                          bundlerUrl,
                          chainId,
                          biconomyPaymasterApiKey: Paymaster_key,
                      });
  
                      saAddress = await smartAccount.getAccountAddress();
  
                      const saveResult = await dbservices.User.saveDetails(userId, appId, deviceId, saAddress);
                      if (!saveResult) {
                          throw new Error("Error saving user details");
                      }
                      userExist = saveResult;
                  }
                  userId = userExist.id;
  
                  token = await generateAuthTokens({
                      userId: userExist.id,
                      role: userExist.role,
                  });
              } else {
                  userId = req["user"].userId;
              }
  
              if (!userId) {
                  return res.status(401).json({ message: "User authentication failed." });
              }
  
              const eventId: any = req.body.eventId;
              const gameId = req.body.gameId as any;
              const gameObject = await dbservices.User.gameObject(gameId);
              const gameeID = await dbservices.User.getGameID(gameId);
              const getevent = await dbservices.User.getEventById(eventId);
              const checkEventwithgame = await dbservices.User.checkEvent(eventId, gameId);
              if (checkEventwithgame.length === 0) {
                  return res.status(404).json({ message: "Event for game not found." });
              }
  
              const gameSaAddress = gameeID.gameSaAddress;
              const creatorID = gameeID.createrId;
              const generateGameId = gameeID.gameId;
  
              if (!getevent || !gameeID) {
                  return res.status(404).json({ message: "Event not found." });
              }
  
              if (!gameeID.isApproved) {
                  return res.status(403).json({ message: "Game is not approved for sending events" });
              }
  
              const chainId = parseInt(process.env.CHAINID || "80002");
              const privKey = sha512_256(gameObject + generateGameId + creatorID);
  
              const rpcHttpProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
              if (!rpcHttpProvider) {
                  return res.status(500).json({ status: false, message: "Error creating RPC provider" });
              }
  
              const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
              if (!wallet) {
                  return res.status(500).json({ status: false, message: "Error creating wallet" });
              }
  
              const account: any = privateKeyToAccount(wallet.privateKey as any);
              const chainName = chainIdToChainName[chainId];
              const client = createWalletClient({
                  account,
                  chain: chainName,
                  transport: http(process.env.PROVIDER_URL),
              });
  
              const eoa = client.account.address;
              const bundlerUrl = chainIdToBundlerUrl[chainId];
              const Paymaster_key = process.env.PAYMASTERAPI_KEY;
  
              const smartAccount = await createSmartAccountClient({
                  signer: client,
                  bundlerUrl,
                  chainId,
                  biconomyPaymasterApiKey: Paymaster_key,
              });
  
              saAddress = await smartAccount.getAccountAddress();
  
              const userDetails = await dbservices.User.getuserdetailsbyId(userId, gameId);
              const sa_address = userDetails[0].saAddress;
              const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
              const datetime = new Date().toISOString();
  
              const encodedData = ethers.utils.toUtf8Bytes(
                  JSON.stringify({ ...userDetails, eventId, datetime })
              );
  
              const tx: any = {
                  to: sa_address,
                  data: ethers.utils.hexlify(encodedData),
                  value: "0",
              };
  
              const txResponse = await smartAccount.sendTransaction(tx);
              const txReceipt: any = await txResponse.wait();
              const transactionHash = txReceipt.receipt.transactionHash;
  
              const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
                  gameId,
                  gameeID.createrId,
                  userId,
                  getevent.id,
                  transactionHash,
                  "0",
                  gameSaAddress,
                  sa_address
              );
  
              return res.status(200).json({
                  status: true,
                  message: "Event sent successfully.",
                  data: saveTransactionDetails,
                  token: token
              });
          } else {
              // Diamante-based flow
              if (req["user"] === null) {
                  const { appId, deviceId } = req.body;
                  if (!appId || !deviceId) {
                      return res.status(400).json({
                          status: false,
                          message: "Missing required fields: appId, deviceId",
                      });
                  }
  
                  let userExist = await dbservices.User.userExists(deviceId, appId);
                  if (!userExist) {
                      userId = `user_${this.generateId()}`;
                      const privKey = this.stringToRawEd25519Seed(appId + deviceId + userId);
                      const diamnetKeypair = DiamSdk.Keypair.fromRawEd25519Seed(privKey);
                      const saAddress = diamnetKeypair.publicKey();
  
                      await axios.get(`https://friendbot.diamcircle.io/?addr=${saAddress}`);
  
                      const saveResult = await dbservices.User.saveDetails(
                          userId,
                          appId,
                          deviceId,
                          saAddress
                      );
  
                      if (!saveResult) {
                          throw new Error("Error saving user details");
                      }
  
                      userExist = saveResult;
                  }
  
                  userId = userExist.id;
  
                  token = await generateAuthTokens({
                      userId: userExist.id,
                      role: userExist.role,
                  });
              } else {
                  userId = req["user"].userId;
              }
  
              if (!userId) {
                  return res.status(401).json({ message: "User authentication failed." });
              }
  
              const eventId: any = req.body.eventId;
              const gameId = req.body.gameId as any;
              const gameObject = await dbservices.User.gameObject(gameId);
              const gameeID = await dbservices.User.getGameID(gameId);
              const getevent = await dbservices.User.getEventById(eventId);
              const checkEventwithgame = await dbservices.User.checkEvent(eventId, gameId);
              if (checkEventwithgame.length === 0) {
                  return res.status(404).json({ message: "Event for game not found." });
              }
  
              const gameSaAddress = gameeID.gameSaAddress;
              const creatorID = gameeID.createrId;
              const generateGameId = gameeID.gameId;
  
              if (!getevent || !gameeID) {
                  return res.status(404).json({ message: "Event not found." });
              }
  
              if (!gameeID.isApproved) {
                  return res.status(403).json({ message: "Game is not approved for sending events" });
              }
  
              const server = new DiamSdk.Aurora.Server("https://diamtestnet.diamcircle.io/");
              const privKey = this.stringToRawEd25519Seed(gameObject + generateGameId + creatorID);
              const diamnetKeypair = DiamSdk.Keypair.fromRawEd25519Seed(privKey);
              const saAddress = diamnetKeypair.publicKey();
              const saAddress_secret = diamnetKeypair.secret();
  
              const sourceAccount = await server.loadAccount(saAddress);
              const userDetails = await dbservices.User.getuserdetailsbyId(userId, gameId);
              const sa_address = userDetails[0].saAddress;
              const datetime = new Date().toISOString();
  
              const transaction = new DiamSdk.TransactionBuilder(sourceAccount, {
                  fee: DiamSdk.BASE_FEE,
                  networkPassphrase: DiamSdk.Networks.TESTNET,
              })
                  .addOperation(
                      DiamSdk.Operation.payment({
                          destination: sa_address,
                          asset: DiamSdk.Asset.native(),
                          amount: "0.1",
                      })
                  )
                  .addMemo(
                      DiamSdk.Memo.text(
                          JSON.stringify({ ...userDetails, eventId, datetime }).slice(0, 28)
                      )
                  )
                  .setTimeout(180)
                  .build();
  
              transaction.sign(diamnetKeypair);

              const result = await server.submitTransaction(transaction);
              const transactionHash = result.hash;
  
              const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
                  gameId,
                  gameeID.createrId,
                  userId,
                  getevent.id,
                  transactionHash,
                  "0",
                  gameSaAddress,
                  sa_address
              );
  
              return res.status(200).json({
                  status: true,
                  message: "Event sent successfully.",
                  data: saveTransactionDetails,
                  token: token
              });
          }
      } catch (error: any) {
          console.error("Unexpected error:", error);
          return res.status(500).json({
              status: false,
              message: error.message || "Unexpected error occurred",
          });
      }
  };
    


    static updateGameToken = async(req:Request, res:Response):Promise<any> => {
      try {
         const gameId= req.body.gameId;
         const updateToken = await dbservices.User.updateGameToken(gameId)
         res.status(200).send({status: true ,message: "Updated game token",data: updateToken})
      } catch (error:any) {
       res.status(500).json({ status:false, message: error.message})
      }
    }

    
    static transactions:any=async(req:Request,res:Response)=>{
      try {
        
        const transactionDetails = await dbservices.User.getTransactionDetails()
        res.status(200).json({ status: true, message:"transaction fetch successful" , data: transactionDetails})
        
      } catch (error) {
        return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
      }
    }


    static count = async(req:Request , res:Response): Promise<any>=>{
      try{
         const count = await dbservices.User.counts()
         res.status(200).json({ status: true, message:"count fetch successful" , data: count})
      }catch(error:any){
        console.error("Unexpected error:", error);
        return res.status(500).json({ status: false, message: error || "Unexpected error occurred" });
      }
      
    }


    static games = async(req:Request , res:Response): Promise<any>=>{
      try{
         const count = await dbservices.User.games()
         res.status(200).json({ status: true, message:"count fetch successful" , data: count})
      }catch(error:any){
        console.error("Unexpected error:", error);
        return res.status(500).json({ status: false, message: error || "Unexpected error occurred" });
      }
      
    }

    static getCreatorRequestStatus = async(req:Request , res:Response): Promise<any>=>{
      try{
         const status = await dbservices.User.getCreatorRequestStatus(parseInt(req.params.userId))
         res.status(200).json({ status: true, message:"creator request status fetch successful" , data: status})
      }catch(error:any){
        console.error("Unexpected error:", error);
        return res.status(500).json({ status: false, message: error || "Unexpected error occurred" });
      }
    }

    // static allData = async(req:Request ,res:Response):Promise<any>=> {
    //   try {
    //     const data = await dbservices.User.getAllData()
    //     res.status(200).json({status: true, message:"data fetch successful" , data: data})
    //   } catch (error: any) {
    //     console.error("Unexpected error:", error);
    //     return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
    //   }
    // }

    static getPendingRequests = async(req: Request, res: Response): Promise<any> => {
        try {
            const userRole = req['user'].role;
            const userId = req['user'].userId;
            

            if (userRole !== 'admin') {
                return res.status(403).json({
                    status: false,
                    message: "Access denied. Admin privileges required"
                });
            }

            // Check if user exists in user table
            const userExists = await dbservices.User.adminUserExists(userId);
           
            if (!userExists) {
                return res.status(404).json({
                    status: false,
                    message: "User not found"
                });
            }

            const requests = await dbservices.User.getPendingRequests();
            return res.status(200).json({
                status: true,
                message: "Pending requests fetch successful",
                data: requests
            });
        } catch (error: any) {
            console.error("Unexpected error:", error);
            return res.status(500).json({
                status: false,
                message: "Internal server error",
                error: error.message
            });
        }
    }


    static approveCreatorRequest = async(req: Request, res: Response): Promise<any> => {
      try {
        const { maAddress } = req.params;
        const { responseType } = req.body;
        const adminRole = req['user'].role;

        // Verify admin role
        if (adminRole !== 'admin') {
          return res.status(403).json({ 
            status: false, 
            message: "Only admin can process creator requests" 
          });
        }

        // Validate response type
        if (!['Approve', 'Reject'].includes(responseType)) {
          return res.status(400).json({
            status: false,
            message: "Invalid response type. Must be either 'Approve' or 'Reject'"
          });
        }

        let result;
        if (responseType === 'Approve') {
          // Update creator request and user role
          result = await dbservices.User.approveCreatorRequest(maAddress);
        } else {
          // Only update request status to rejected
          result = await dbservices.User.rejectCreatorRequest(maAddress);
        }

        if (!result) {
          return res.status(404).json({
            status: false,
            message: "Creator request not found"
          });
        }

        return res.status(200).json({
          status: true,
          message: `Creator request ${responseType.toLowerCase()}d successfully`,
          data: result
        });

      } catch (error: any) {
        return res.status(500).json({ 
          status: false, 
          message: error.message || "Unexpected error occurred" 
        });
      }
    }

    static stringToRawEd25519Seed(str: string): Buffer {
      const hash = sha512_256(str);
      return Buffer.from(hash, 'hex');
    }
}



