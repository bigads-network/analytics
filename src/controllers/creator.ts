import {Request , Response } from 'express';
import dbservices from '../services/dbservices';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { generateAuthTokens } from '../config/token';
import { sha512_256 } from 'js-sha512';
import { ethers } from 'ethers';
import { createSmartAccountClient, Paymaster } from '@biconomy/account';
import { chainIdToBundlerUrl, chainIdToChainName, envConfigs } from '../config/envconfig';
import { generateGameToken } from '../config/gameToken';

export default class Creator{
   
   static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();
   
   static creatorRegister = async (req: Request, res: Response):Promise<any> => {
    try {
        const { devicedata } = req.body;

        if (!devicedata) {
            return res.status(400).json({ status: false, message: "Device data is required" });
        }

        let userExist = await dbservices.Creator.creatorExits(devicedata);
        let message = "User Logged In";
        let userId, saAddress, token;

        if (!userExist) {
            const chainId = parseInt(envConfigs.chainId || "80002");
            if (!chainId) {
                throw new Error("Missing or invalid chainId in environment variables");
            }

            userId = `creator_${this.generateId()}`; // Assuming `generateId` is defined elsewhere
            const privKey = sha512_256(devicedata + userId);
            const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

            if (!rpcHttpProvider) {
                return res.status(500).json({ status: false, message: "Error creating RPC provider" });
            }

            const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
            if (!wallet) {
                return res.status(500).json({ status: false, message: "Error creating wallet" });
            }

            const wallet_address = await wallet.getAddress();
            console.log(wallet_address, "wallet_address");

            const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
            const chainName = chainIdToChainName[chainId];
            if (!chainName) {
                return res.status(500).json({ status: false, message: "Unsupported chainId" });
            }

            const client = createWalletClient({
                account,
                chain: chainName,
                transport: http(),
            });


            const bundlerUrl = chainIdToBundlerUrl[chainId];
            if (!bundlerUrl) {
                return res.status(500).json({ status: false, message: "Unsupported chainId for bundler" });
            }
            const Paymaster_key = envConfigs.paymaster_apikey;
            if (!Paymaster_key) {
                return res.status(500).json({ status: false, message: "Missing Paymaster API key" });
            }

            const smartAccount = await createSmartAccountClient({
                signer: client,
                bundlerUrl,
                chainId,
                biconomyPaymasterApiKey: Paymaster_key,
            });

            saAddress = await smartAccount.getAccountAddress();
            console.log(saAddress ,"Account................................");
            //0xcf03387269ec267bEEF77d932deB4437e811D459 Account................................
            const saveResult = await dbservices.Creator.saveCreator(userId, devicedata, saAddress, wallet_address);

            if (!saveResult) {
                throw new Error("Error saving user details");
            }

            userExist = saveResult;
            message = "User registered Successfully";
        }

        token = await generateAuthTokens({ userId: userExist.id, role: userExist.role });

        return res.status(200).json({
            status: true,
            message,
            data: {
                id: userExist.id,
                userId: userExist.userId,
                role: userExist.role,
                devicedata,
                saAddress: userExist.saAddress,
                walletAddress: userExist.walletAddress,
            },
            token,
        });
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            message: error.message || "Unexpected error occurred",
        });
    }
   };

   static gameRegister = async (req: Request, res: Response): Promise<any> => {
    try {
        const creatorId = req['user'].userId;
        const role = req['user'].role;
        if (!creatorId || role!== "craetor") {
            return res.status(401).json({ status: false, message: "Invaid role for Game Creation"});
        }
        const {gameName , gameType ,description}= req.body;
        if (!gameName || !gameType ||!description) {
            return res.status(400).json({ status: false, message: "Game data is required"});
        }
        let gameExist = await dbservices.Creator.gameExists(creatorId,gameName ,gameType );
        let message = "Game Already exists";
        let saAddress;
        if (!gameExist) {
            const chainId = parseInt(envConfigs.chainId || "80002");
            if (!chainId) {
                throw new Error("Missing or invalid chainId in environment variables");
            }
            
            const gameId = `game_${this.generateId()}`;
            const privKey = sha512_256(gameId + gameName +gameType);
            
            const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);
            if (!rpcHttpProvider) {
                return res.status(500).json({ status: false, message: "Error creating RPC provider" });
            }
    
            const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
            if (!wallet) {
                return res.status(500).json({ status: false, message: "Error creating wallet" });
            }
            const wallet_address = await wallet.getAddress();

            console.log("wallet" , wallet_address)
            const account: any = privateKeyToAccount(wallet.privateKey as any);
            const chainName = chainIdToChainName[chainId];
            const client = createWalletClient({
                account,
                chain: chainName,
                transport: http(),
            });
    
            const eoa = client.account.address;
            const bundlerUrl = chainIdToBundlerUrl[chainId];
            const Paymaster_key = envConfigs.paymaster_apikey;
    
            const smartAccount = await createSmartAccountClient({
                signer: client,
                bundlerUrl,
                chainId,
                biconomyPaymasterApiKey: Paymaster_key
            });
    
            saAddress = await smartAccount.getAccountAddress();
    console.log(saAddress ,"saAddress................................................................");
            const saveResult = await dbservices.Creator.registerGame(creatorId, gameId, gameName, gameType, description , saAddress ,wallet_address);
            if (!saveResult) {
                throw new Error("Error saving user details");
            }
    
            gameExist = saveResult;
            message = "Game registered Successfully";
        }

        const Gametoken= await generateGameToken(gameExist.id)
        res.status(200).json({
            status: true,
            message:message,
            data: gameExist,
            gameToken : Gametoken
        })  
    } catch (error) {
        res.status(500).json({
            status: false,
            message: error.message || "Unexpected error occurred",
        })
    }
   }


   static eventsRegister = async( req: Request, res: Response):Promise<any> => {
    try{
        const creatorId = req['user'].userId;
        const role = req['user'].role;
        if (!creatorId || role!== "craetor") {
            return res.status(401).json({ status: false, message: "Invaid role for Event Creation"});
        }
        const { eventType} = req.body;
        const gameid = req.body.gameId;

        if (!eventType) {
            return res.status(400).json({ status: false, message: "Event data is required"});
        }
        const eventExists = await dbservices.Creator.eventexists(gameid ,eventType)
        if (eventExists) {
            return res.status(400).json({ status: false, message: "Event already exists for this game"});
        }
        const eventId = `event_${this.generateId()}`; // Assuming `generateId` is defined elsewhere
        const event = await dbservices.Creator.registerEvent(gameid,eventId ,eventType)
        res.status(200).json({
            status: true,
            message: "Event created successfully",
            event: event
        })
        
    }catch(error){
        res.status(500).json({
            status: false,
            message: error.message || "Unexpected error occurred",
        })
    }
   }
   
}