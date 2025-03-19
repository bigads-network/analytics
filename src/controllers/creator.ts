import {Request , Response } from 'express';
import dbservices from '../services/dbservices/creator';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { generateAuthTokens } from '../config/token';
import DiamSdk from "diamnet-sdk"
import axios from 'axios';
import { sha512_256 } from 'js-sha512';
import { ethers } from 'ethers';
import { createSmartAccountClient, Paymaster } from '@biconomy/account';
import { chainIdToBundlerUrl, chainIdToChainName, providerUrl } from '../config/envconfig';

export default class Creator{

    static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

    static stringToRawEd25519Seed(str: string): Buffer {
    const hash = sha512_256(str);
    return Buffer.from(hash, 'hex');
    }

    static registerGame: any = async (req: Request, res: Response): Promise<any> => {
    const { wallet_address } = req.body;

    const user = await dbservices.userExists(wallet_address);
    if (!user) {
    return res.status(404).json({ status: false, message: "User not found" });
    }

    try {
    const userId = req['user'].userId;
    const role = req['user'].role;

    if(user.id !== userId){
    return res.status(403).json({ status: false, message: 'wallet addres is not associated with the userid' });
    }

    if (role !== 'creator' && role !== 'admin') {
    throw new Error("Invalid role");
    }
    const gameData = req.body;
    let gameExist = await dbservices.gameExists(userId, gameData.name, gameData.type);
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

        const saveResult = await dbservices.registerGame(userId, gameId, gameData, saAddress);
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

        const saveResult = await dbservices.registerGame(userId, gameId, gameData, saAddress);
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
    } //done 

    static async deleteGame(req: Request, res: Response): Promise<void> {
        try {
          const { gameId } = req.params; // Get gameId from URL params (varchar in schema)
          const { id, userRole, maAddress } = req.body; // Assuming these come from body
    
          // Validate inputs
          if (!gameId) {
           res.status(400).json({ status: false, message: "Game ID is required" });
          }
    
          if (!maAddress) {
             res.status(400).json({ status: false, message: "User address is required" });
          }
    
          // Check if user exists
          const user = await dbservices.userExists(maAddress);
          if (!user) {
           res.status(404).json({ status: false, message: "User not found" });
          }
    
          // Validate user role
          if (userRole !== 'creator' && userRole !== 'admin') {
          res.status(403).json({ status: false, message: "Unauthorized: Only creators or admins can delete games" });
          }
    
          // Check if game exists using gameId (varchar from schema)
          const game = await dbservices.gameExistsByGameId(gameId, parseInt(id));
          if (!game) {
             res.status(404).json({ status: false, message: "Game not found or not created by this user" });
          }
    
          // Verify user ownership if creator
          if (userRole === 'creator' && game.createrId !== user.id) {
             res.status(403).json({ status: false, message: "Unauthorized: You can only delete your own games" });
          }
    
          // Delete game and related data
          const result = await dbservices.deleteGameAndRelatedData(gameId, user.id, userRole);
    
          res.status(200).json({ 
            status: true, 
            message: "Game and all related data deleted successfully",
            data: result.deletedGame,
          });
        } catch (error) {
           res.status(500).json({ 
            status: false, 
            message: error.message || "Failed to delete game and related data" 
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
    const checkExist = await dbservices.checkGameExists(userId, gameId)
    if(checkExist.length===0){
    throw new Error("game not found for paricular creator")
    }
    const {eventType} = req.body
    const checkevent = await dbservices.checkevent(gameId,eventType)
    console.log(checkevent ,"wertyu")
    if(checkevent.length > 0){
    throw new Error("already registered event")
    }
    const createEvent = await dbservices.createEvent( gameId ,eventType)
    res.status(200).send({status: true , message:"Event created" , event : createEvent})
    } catch (error:any) {
    res.status(500).json({ status: false, message: error.message})

    }
    } //done

    static updateGameToken = async(req:Request, res:Response):Promise<any> => {
    try {
    const gameId= req.body.gameId;
    const updateToken = await dbservices.updateGameToken(gameId)
    res.status(200).send({status: true ,message: "Updated game token",data: updateToken})
    } catch (error:any) {
    res.status(500).json({ status:false, message: error.message})
    }
    }
}