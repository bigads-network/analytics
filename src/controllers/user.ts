import {Request , Response } from 'express';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { generateAuthTokens } from '../config/token';
import { sha512_256 } from 'js-sha512';
import { ethers } from 'ethers';
import { createSmartAccountClient, Paymaster, PaymasterMode,BiconomySmartAccountV2 } from '@biconomy/account';
// import {
//     createSmartAccountClient,
//     createBicoPaymasterClient,
//     toNexusAccount,
//   } from '@biconomy/abstractjs';
import { chainIdToBundlerUrl, chainIdToChainName, envConfigs } from '../config/envconfig';
import { generateGameToken } from '../config/gameToken';
import dbservices from '../services/dbservices';
import { polygonAmoy } from 'viem/chains';

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
    const eventCheck = await dbservices.User.eventCheck(gameId ,eventId)
      if(!eventCheck){
        return res.status(400).json({ status: false, message: "Event does not exist for this game"});
      }
    console.log(gameId , id ,".................gameid .id");     
    const { devicedata } = req.body;
    if (!devicedata) {
            return res.status(400).json({ status: false, message: "Device data is required" });
        }
    let userExist = await dbservices.User.userExits(devicedata);
    let userId, saAddress ;
    const gameDetails = await dbservices.User.getGameDetails(gameId)
      const gameName = gameDetails.Gamename;
      const gameType = gameDetails.Gametype;
      const CreatedgameId=gameDetails.gameId

    if(userExist){
    console.log("existssssssss................................................................")
    if(gameDetails.creatorId=== userExist.id){
        return res.status(500).send({ status:false ,message : "cannot fire event for own game "})
      }
      const chainId = parseInt(envConfigs.chainId);
      if (!chainId) {
          throw new Error("Missing or invalid chainId in environment variables");
      }
      userId =userExist.userId ;
      const privKey = "0x" + sha512_256(userId) ;

      console.log(privKey, "priva...........");
      const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

    const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

    const wallet_address = await wallet.getAddress();
    const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);

    const client = createWalletClient({
      account,
      chain: polygonAmoy,
      transport: http(),
    });

    const smartAccount = await createSmartAccountClient({
      signer: client,
      bundlerUrl:envConfigs.chain80002,
      biconomyPaymasterApiKey: envConfigs.paymaster_apikey,
    });

    saAddress = await smartAccount.getAccountAddress();
    const datetime = new Date().toISOString();
    const contractAddress = envConfigs.contractAddress;
    const metadata = JSON.stringify({ ...userExist, id, datetime });
    const iface = new ethers.utils.Interface(abi);
    const calldata = iface.encodeFunctionData("storeMetadata", [
      metadata,
      gameId,
    ]);
    const tx = {
      to: contractAddress,
      data: calldata,
      value: "0",
    };
    const txResponse = await smartAccount.sendTransaction(tx, {
      paymasterServiceData: {
        mode: PaymasterMode.SPONSORED,
      },
    });

    const userOpReceipt = await txResponse.wait();
      const transactionHash = userOpReceipt.receipt.transactionHash;

    const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
      gameId,
      userExist.id,
      id,
      transactionHash,
      "polygon",
        "0",          
        );
          return res.status(200).json({
          status: true,
          message: "Event Fired Successfully",
          transactionDetails : saveTransactionDetails,
          user:userExist
        })
    }     

    if(!userExist){
      const chainId = parseInt(envConfigs.chainId);
      if (!chainId) {
          throw new Error("Missing or invalid chainId in environment variables");
      }
    console.log("inside................")
    userId = `user_${this.generateId()}`;
    const privKey = "0x" + sha512_256(userId)
    // const source = "1086651866" + "sushilIsKing";
    // const privKey = "0x" + sha512_256(source);

    console.log(privKey, "priva...........");
    const rpcHttpProvider = new ethers.providers.JsonRpcProvider(envConfigs.providerUrl);

    const wallet = new ethers.Wallet(privKey, rpcHttpProvider);

    const wallet_address = await wallet.getAddress();
    const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);

    const client = createWalletClient({
    account,
    chain: polygonAmoy,
    transport: http(),
    });

    const smartAccount = await createSmartAccountClient({
    signer: client,
    bundlerUrl:envConfigs.chain80002,
    biconomyPaymasterApiKey: envConfigs.paymaster_apikey,
    });

    saAddress = await smartAccount.getAccountAddress();
    console.log(saAddress, "Account................................");
    const saveResult = await dbservices.User.saveUser(userId, devicedata, saAddress, wallet_address);

    userExist = saveResult
    const datetime = new Date().toISOString();
    const contractAddress = envConfigs.contractAddress;
    const metadata = JSON.stringify({ ...userExist, id, datetime });
    const iface = new ethers.utils.Interface(abi);
    const calldata = iface.encodeFunctionData("storeMetadata", [metadata,gameId]);
    const tx = {
    to: contractAddress,
    data: calldata,
    value: "0",
    };

    const txResponse = await smartAccount.sendTransaction(tx, {
    paymasterServiceData: {
    mode: PaymasterMode.SPONSORED,
    },
    });
    console.log(txResponse, "txResponse...............");

    const userOpReceipt = await txResponse.wait();
    console.log("userOpReceipt...........", userOpReceipt);
    const transactionHash = userOpReceipt.receipt.transactionHash;

    const saveTransactionDetails = await dbservices.User.saveTransactionDetails(
    gameId,
    userExist.id,
    id,
    transactionHash,
    "polygon",
    "0",          
    );
    return res.status(200).json({
      status: true,
      message: "Event Fired Successfully",
      transactionDetails : saveTransactionDetails,
      user:userExist
    })
  }
    } catch (error) {
      console.log(error ,"Exception")
      res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      })
    }
  }  
}