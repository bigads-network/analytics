import {Request , Response } from 'express';
import dbservices from '../services/dbservices';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { generateAuthTokens } from '../config/token';
import { sha512_256 } from 'js-sha512';
import { ethers } from 'ethers';
import { createSmartAccountClient, Paymaster } from '@biconomy/account';
import { chainIdToBundlerUrl, chainIdToChainName, providerUrl } from '../config/envconfig';



export default class User{

    static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

    static registerUser: any = async (req: Request, res: Response) => {
      try {
        // console.log("registerUser request body:", req.body);
  
        const { appId, deviceId } = req.body;
        if (!appId || !deviceId ) {
          return res.status(400).json({ status: false, message: "Missing required fields: appId, deviceId" });
        }
  
        let userExist = await dbservices.User.userExists(deviceId, appId);
        // console.log("User exists:", userExist);
  
        let message = "User Logged In";
        let userId, saAddress;
  
        if (!userExist) {
          const chainId = parseInt(process.env.CHAINID || "80002");
          if (!chainId) {
            throw new Error("Missing or invalid chainId in environment variables");
          }
  
          userId = await `user_${this.generateId()}`;
          // console.log("Generated userId:", userId);
  
          const privKey = sha512_256(appId + deviceId + userId);
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
  
          const saveResult = await dbservices.User.saveDetails(userId, appId, deviceId, saAddress);
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
          data: { userId: userExist.userId, appId, deviceId, saAddress: userExist.saAddress },
          token,
        });
      } catch (error: any) {
        console.error("Unexpected error:", error);
        return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
      }
    };
  

    static registerGame: any = async (req: Request, res: Response) :Promise<any>=> {
        try {
          // console.log("Register" , req['user'])
          const userId = req['user'].userId
          const role = req['user'].role
          // console.log(userId , role)
          // if(role!= 'creator') {
          //   throw new Error("Invalid role")
          // }
          const gameData = req.body;
          let gameExist = await dbservices.User.gameExists(userId ,gameData.name, gameData.type);
          if (!gameData || !gameData.events || !Array.isArray(gameData.events)) {
            return res.status(400).json({ message: 'Invalid game data or events.' });
          }
          let message = "Game Already exists";
          let saAddress;
          if (!gameExist) {
            const chainId = parseInt(process.env.CHAINID || "80002");
            if (!chainId) {
              throw new Error("Missing or invalid chainId in environment variables");
            }
           // console.log(gameData ,"gameDataaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
            const gameId = `game_${this.generateId()}`
            // console.log("Generated userId:", userId);
    
            const privKey = sha512_256(gameData + gameId + userId);
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
    
            saAddress = await smartAccount.getAccountAddress();
            // console.log("Smart Account Address:", saAddress);
    
             const saveResult = await dbservices.User.registerGame(userId ,gameId ,gameData ,saAddress);
            if (!saveResult) {
              throw new Error("Error saving user details");
            }
    
            gameExist = saveResult;
            // console.log(gameExist ," gameeeregistered");
            message = "Game registered Succesfully";
          }
      
          return res.status(201).json({ message: message, data: gameExist });
        
      } catch (error:any) {
        return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
      }
    }


    static sendEvents = async(req:Request, res:Response):Promise<any>=>{
      try{
        const userId = req['user'].userId   // to user  the user is come to play
        const eventId:any = req.query.eventId  // event which user come to play
        const gameId = req.query.gameId as any // gameId which user play (primarykey)
        const gameObject= await dbservices.User.gameObject(gameId)
        const gameeID = await dbservices.User.getGameID(gameId) // get  creator Details  from  it
        const getevent = await dbservices.User.getEventById(eventId)
        const gameSaAddress = gameeID.gameSaAddress;  // from address information
        const creatorID= gameeID.createrId
        const generateGameId= gameeID.gameId
        // console.log(getevent.id , userId , eventId ,gameId)
        if(!getevent ||!gameeID){
          return res.status(404).json({ message: 'Event not found.' });
        }
        const chainId = parseInt(process.env.CHAINID || "80002");

        // // console.log(gameObject , generateGameId , creatorID)
        const privKey = sha512_256(gameObject + generateGameId + creatorID);
            // // console.log("Generated private key:", privKey);
    
            const rpcHttpProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
            if (!rpcHttpProvider) {
              return res.status(500).json({ status: false, message: "Error creating RPC provider" });
            }
    
            const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
            if (!wallet) {
              return res.status(500).json({ status: false, message: "Error creating wallet" });
            }
    
            // console.log("provider url.........",providerUrl);
            // console.log(wallet.privateKey, "private key........")
            const account:any = privateKeyToAccount(wallet.privateKey as any);
            const chainName = chainIdToChainName[chainId];
            const client = createWalletClient({
              account,
              chain: chainName,
              transport: http(providerUrl),
            });
    
            const eoa = client.account.address;
            // // console.log(`EOA address: ${eoa}`);
    
            const bundlerUrl = chainIdToBundlerUrl[chainId];
            // // console.log("Bundler URL:", bundlerUrl);
    
             const Paymaster_key = process.env.PAYMASTERAPI_KEY
             // console.log(Paymaster_key)
            
            const smartAccount = await createSmartAccountClient({
              signer: client,
              bundlerUrl,
              chainId,
              biconomyPaymasterApiKey:Paymaster_key
            });

            const saAddress = await smartAccount.getAccountAddress();
            // console.log("Smart Account Address:", saAddress);
        // const privateKey =  sha512_256("APPID" + "EVENTID"); // from addres which is always same as the all the transaction get pol from this address
        const  userDetails = await dbservices.User.getuserdetailsbyId(userId,gameId)
        // console.log(userDetails , "userDetails")
        const sa_address = userDetails[0].saAddress;
        const provider = new ethers.providers.JsonRpcProvider(providerUrl);
        // const encodedData = ethers.utils.toUtf8Bytes(JSON.stringify(userDetails));
        const tx:any = {
          to: sa_address,
          data:"0x",
          value: ethers.utils.parseUnits("0.0001",18),
        };
        // console.log("tx...........",tx)
        const txResponse = await smartAccount.sendTransaction(tx);
        const txReceipt:any = await txResponse.wait();
        const transactionHash = txReceipt.receipt.transactionHash  
        const saveTransactionDetails = await dbservices.User.saveTransactionDetails(gameId,gameeID.createrId,userId ,getevent.id ,transactionHash ,"0",gameSaAddress ,sa_address);
        return res.status(200).json({ status:true,message: 'Event sent successfully.', data: saveTransactionDetails});
      }catch(error:any){

        console.error("Unexpected error:", error);
        return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
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

    // static allData = async(req:Request ,res:Response):Promise<any>=> {
    //   try {
    //     const data = await dbservices.User.getAllData()
    //     res.status(200).json({status: true, message:"data fetch successful" , data: data})
    //   } catch (error: any) {
    //     console.error("Unexpected error:", error);
    //     return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
    //   }
    // }
}
