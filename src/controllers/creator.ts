import {Request , Response } from 'express';
import dbservices from '../services/dbservices';

import { generateAuthTokens } from '../config/token';
import { sha512_256 } from 'js-sha512';
import { ethers } from 'ethers';
import { ModularSdk, EtherspotBundler, sleep } from "@etherspot/modular-sdk";
import { chainIdToBundlerUrl, chainIdToChainName, envConfigs } from '../config/envconfig';
import { generateGameToken } from '../config/gameToken';
import { polygon, xdc } from 'viem/chains';

export default class Creator{
   
   static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();
   
   static creatorRegister = async (req: Request, res: Response):Promise<any> => {
    try {
        const { devicedata } = req.body;

        if (!devicedata) {
            return res.status(400).json({ status: false, message: "Device data is required" });
        }

        let userExist = await dbservices.Creator.creatorExits(devicedata);
        let message = "Creator Logged In";
        let userId, saAddress, token;

        if (!userExist) {
            userId = `creator_${this.generateId()}`; // Assuming `generateId` is defined elsewhere
            const privKey = "0x"+sha512_256(devicedata + userId);
            // console.log(privKey)
            const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.provider_url_AVAX);
            const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
            const wallet_address = await wallet.getAddress();
            if (!rpcHttpProvider) {
                return res.status(500).json({ status: false, message: "Error creating RPC provider" });
            }
            if (!wallet) {
                return res.status(500).json({ status: false, message: "Error creating wallet" });
            }

            // console.log(wallet_address, "wallet_address");

            const chainName = xdc;

            const modularSdk = new ModularSdk(privKey, {
                chainId: 50, // XDC Mainnet
                bundlerProvider: new EtherspotBundler(
                  50,
                  envConfigs.etherspot_api_Key
                ),
              });

            const saAddress = await modularSdk.getCounterFactualAddress();
              //   console.log(saAddress ,"Account................................");
            const saveResult = await dbservices.Creator.saveCreator(userId, devicedata, saAddress, wallet_address);

            if (!saveResult) {
                throw new Error("Error saving user details");
            }

            userExist = saveResult;
            message = "Creator registered Successfully";
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

   static AdminRegister = async (req: Request, res: Response):Promise<any> => {
    try {
        const { devicedata } = req.body;
        if (!devicedata) {
            return res.status(400).json({ status: false, message: "Device data is required" });
        }

        let userExist = await dbservices.Creator.creatorExits(devicedata);
        let message = "Admin Logged In";
        let userId, saAddress, token;

        if (!userExist) {
            userId = `admin_${this.generateId()}`; // Assuming `generateId` is defined elsewhere
            const privKey = "0x"+sha512_256(userId)
            const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.provider_url_AVAX);  
            const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
            const wallet_address = await wallet.getAddress();
            console.log(wallet.privateKey ,"wallet_address...........private...............")
            console.log(privKey ,"........privatekey")
            if (!rpcHttpProvider) {
                return res.status(500).json({ status: false, message: "Error creating RPC provider" });
            }
            if (!wallet) {
                return res.status(500).json({ status: false, message: "Error creating wallet" });
            }

            // console.log(wallet_address, "wallet_address");

            const chainName = xdc;

            const modularSdk = new ModularSdk(privKey, {
                chainId: 43114, //  Mainnet
                bundlerProvider: new EtherspotBundler(
                  43114,
                  envConfigs.etherspot_api_Key
                ),
              });

            const saAddress = await modularSdk.getCounterFactualAddress();
              //   console.log(saAddress ,"Account................................");
            const saveResult = await dbservices.Creator.saveAdmin(userId, devicedata, saAddress, wallet_address);

            if (!saveResult) {
                throw new Error("Error saving user details");
            }

            userExist = saveResult;
            message = "Admin registered Successfully";
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
        // console.log(".....................................................")
        const creatorId = req['user'].userId;
        const role = req['user'].role;
        if (!creatorId || role!== "craetor") {
            return res.status(401).json({ status: false, message: "Invaid role for Game Creation"});
        }
        const {gameName , gameType ,description}= req.body;
        // console.log(gameName ,gameType ,description ,"req,body")
        if (!gameName || !gameType ||!description) {
            return res.status(400).json({ status: false, message: "Game data is required"});
        }
        let gameExist = await dbservices.Creator.gameExists(creatorId,gameName ,gameType );
        // console.log(gameExist ,"gameExits")
        let message = "Game Already exists";
        let saAddress;
        if (!gameExist) {
            // const chainId = parseInt(envConfigs.chainId || "80002");
            // if (!chainId) {
            //     throw new Error("Missing or invalid chainId in environment variables");
            // }
            console.log( " inside not gameExits")

            const gameId = `game_${this.generateId()}`;
            const privKey ="0x"+sha512_256(gameName+gameType +description);
            const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.provider_url_AVAX);
            const wallet = new ethers.Wallet(privKey, rpcHttpProvider);
            const wallet_address = await wallet.getAddress();
            if (!rpcHttpProvider) {
                return res.status(500).json({ status: false, message: "Error creating RPC provider" });
            }
            if (!wallet) {
                return res.status(500).json({ status: false, message: "Error creating wallet" });
            }

            // console.log(wallet_address, "wallet_address");

            const chainName = xdc;

            const modularSdk = new ModularSdk(privKey, {
                chainId: 50, // XDC Mainnet
                bundlerProvider: new EtherspotBundler(
                  50,
                  envConfigs.etherspot_api_Key
                ),
              });

            const saAddress = await modularSdk.getCounterFactualAddress();
            //   console.log(saAddress ,"saAddress................................................................");
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
        console.log(error.message)
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
        const { eventType ,eventDescription} = req.body;
        const gameid = req.body.gameId;

        if (!eventType) {
            return res.status(400).json({ status: false, message: "Event data is required"});
        }
        const eventExists = await dbservices.Creator.eventexists(gameid ,eventType)
        if (eventExists) {
            return res.status(400).json({ status: false, message: "Event already exists for this game"});
        }
        const eventId = `event_${this.generateId()}`; // Assuming `generateId` is defined elsewhere
        const event = await dbservices.Creator.registerEvent(gameid,eventId ,eventType ,eventDescription)
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