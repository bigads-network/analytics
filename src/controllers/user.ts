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


  static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

  static registerUser: any = async (req: Request, res: Response) => {
    try {
        const { appId, deviceId, maAddress } = req.body;
        const walletAddress = maAddress || '';

        let userExist, message = "User Logged In", userId, saAddress, token;

        if (walletAddress.startsWith('0x')) {
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

  static requestCreator = async(req:Request, res:Response):Promise<any> => {
  try {
    const { maAddress } = req.body;
    
    // Check if user exists
    const user = await dbservices.User.userExists(maAddress);
    console.log(user.id ,"userid")
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Check if user already has a pending request
    const existingRequest = await dbservices.User.getCreatorRequest(maAddress);
    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({ 
          status: false, 
          message: "You already have a pending creator request" 
        });
      } else if (existingRequest.status === 'approved') {
        return res.status(400).json({ 
          status: false, 
          message: "You are already a creator" 
        });
      }
    }

    // Create new creator request
    const creatorRequest = await dbservices.User.createCreatorRequest( user.id ,maAddress);
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
  };

  static sendEvents = async (req: Request, res: Response): Promise<any> => {
    const {  wallet_address } = req.body;
    const eventId: any = req.body.eventId;

    console.log(process.env.PROVIDER_URL ,"providerrrrrr")
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

                let userExist = await dbservices.User.userExists(wallet_address);
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
                JSON.stringify({ ...userDetails, eventId, datetime ,gameObject})
            );

            const tx: any = {
                to: sa_address,
                data:ethers.utils.hexlify(encodedData),
                value: ethers.utils.parseEther("0.00001").toString(),
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

                let userExist = await dbservices.User.userExists(wallet_address);
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

            const user = await dbservices.User.userExists(wallet_address);
            if (!user) {
              return res.status(404).json({ status: false, message: "User not found" });
          }
            if(user.id !== userId){
              return res.status(403).json({ status: false, message: 'wallet addres is not associated with the userid' });
            }

            const gameId = req.body.gameId as any;
            const gameObject = await dbservices.User.gameObject(gameId);
            const gameeID = await dbservices.User.getGameID(gameId);
            const getevent = await dbservices.User.getEventById(eventId);
            const checkEventwithgame = await dbservices.User.checkEvent(eventId, gameId);
            console.log(checkEventwithgame)
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

  static getCreatorRequestStatus = async(req:Request , res:Response): Promise<any>=>{
      try{
         const status = await dbservices.User.getCreatorRequestStatus(parseInt(req.params.userId))
         res.status(200).json({ status: true, message:"creator request status fetch successful" , data: status})
      }catch(error:any){
        console.error("Unexpected error:", error);
        return res.status(500).json({ status: false, message: error || "Unexpected error occurred" });
      }
  }

  static stringToRawEd25519Seed(str: string): Buffer {
    const hash = sha512_256(str);
    return Buffer.from(hash, 'hex');
   }
   
}



