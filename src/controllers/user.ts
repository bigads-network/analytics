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
          if(role!= 'creator') {
            throw new Error("Invalid role")
          }
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

    // static registerGame: any = async (req: Request, res: Response): Promise<any> => {
    //   try {
    //     const userId = req['user'].userId;
    //     const role = req['user'].role;
    
    //     // Validate role if necessary
    //     if (role !== 'creator') {
    //       throw new Error("you should be creator to be to register a  game and its events"); 
    //     }
    
    //     const gamesData = req.body;
    
    //     if (!Array.isArray(gamesData) || gamesData.length === 0) {
    //       return res.status(400).json({ message: 'Invalid games data. Provide an array of games.' });
    //     }
    
    //     const chainId = parseInt(process.env.CHAINID || "80002");
    //     if (!chainId) {
    //       throw new Error("Missing or invalid chainId in environment variables");
    //     }
    
    //     const rpcHttpProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
    //     if (!rpcHttpProvider) {
    //       return res.status(500).json({ status: false, message: "Error creating RPC provider" });
    //     }
    
    //     const Paymaster_key = process.env.PAYMASTERAPI_KEY;
    
    //     const results = [];
    //     let message ;
    //     for (const gameData of gamesData) {
    //       if (!gameData || !gameData.events || !Array.isArray(gameData.events)) {
    //         return res.status(400).json({ message: 'Invalid game data or events in one or more games.' });
    //       }
    
    //       let gameExist = await dbservices.User.gameExists(userId, gameData.name, gameData.type);
    //       message = "Game Already exists";
    //       if (!gameExist) {
    //         const gameId = `game_${this.generateId()}`;
    //         const privKey = sha512_256(JSON.stringify(gameData) + gameId + userId);
    //         const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
    
    //         const account: any = privateKeyToAccount(wallet.privateKey as any);
    //         const chainName = chainIdToChainName[chainId];
    //         const client = createWalletClient({
    //           account,
    //           chain: chainName,
    //           transport: http(),
    //         });
    
    //         const bundlerUrl = chainIdToBundlerUrl[chainId];
    //         const smartAccount = await createSmartAccountClient({
    //           signer: client,
    //           bundlerUrl,
    //           chainId,
    //           biconomyPaymasterApiKey: Paymaster_key,
    //         });
    
    //         const saAddress = await smartAccount.getAccountAddress();
    
    //         const saveResult = await dbservices.User.registerGame(userId, gameId, gameData, saAddress);
    //         if (!saveResult) {
    //           throw new Error("Error saving game details");
    //         }
    
    //         gameExist = saveResult;
    //          message = "Game registered Succesfully";

    //       }
    
    //       results.push(gameExist);
    //     }
    
    //     return res.status(201).json({ message: message, data: results });
    //   } catch (error: any) {
    //     return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
    //   }
    // };
    
    static eventCreation = async(req:Request, res:Response):Promise<any> => {
        try {
          console.log("hittttt")
          const userId = req['user'].userId;
          const gameId = req.params.gameId;
          const checkExist = await dbservices.User.checkGameExists(userId, gameId)
          console.log("checkExist" , checkExist)
          if(checkExist.length===0){
            throw new Error("game not found for paricuuar uuser")
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

    static sendEvents = async(req:Request, res:Response):Promise<any>=>{
      try{
        const gameApiKey = req.headers['gameapikey'] as string;

        // Check if the gameApiKey is missing
        if (!gameApiKey) {
          return res.status(400).json({ status: false, message: 'Missing gameApiKey in headers.' });
        }

        // Compare the provided gameApiKey with the static key in the environment
        const staticGameApiKey = process.env.GAME_API_KEY;
        if (gameApiKey !== staticGameApiKey) {
          return res.status(403).json({ status: false, message: 'Invalid gameApiKey.' });
        }
    
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

        if(!gameeID.isApproved){
          return res.status(403).json({ message: 'Game is not approved for  sending events' });
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
            // console.log(`EOA address: ${eoa}`);
    
            const bundlerUrl = chainIdToBundlerUrl[chainId];
            // console.log("Bundler URL:", bundlerUrl);
    
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
        const datetime = new Date().toISOString(); // Current datetime in ISO format
        const encodedData = ethers.utils.toUtf8Bytes(
          JSON.stringify({ ...userDetails, eventId, datetime })
        );
                const tx:any = {
          to: sa_address,
          data:ethers.utils.hexlify(encodedData),
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
