import { Request, Response } from "express";
import dbservices from "../services/dbservices";
import { generateAuthTokens } from "../config/token";
import {sha512_256} from "js-sha512"
import { ethers } from "ethers";
import {Hex, WalletClient, createWalletClient, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import { chainIdToBundlerUrl, chainIdToChainName, providerUrl } from "../config/envconfig";
import {createSmartAccountClient} from "@biconomy/account"


// console.log(providerUrl ,chainIdToBundlerUrl ,chainIdToChainName)

export class User {
  static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

  static testRoute:any = async(req:Request,res:Response)=>{
    try{
      return res.status(200).send({message:"Api is Running...",status:true})
    }catch(error){
      return res.status(500).send({message:"Api Giving Error",status:false})
    }
  }

  static registerUser: any = async (req: Request, res: Response) => {
    try {
      console.log("registerUser" , req.body)
      let { appId, deviceId} = req.body;
      const userExist = await dbservices.User.userExists(deviceId ,appId);
      console.log("registerUser" , req.body)
      if(userExist.length > 0){
        return res.status(400).json({ status: false, message: "User already exists" });
      }
      let chainId = parseInt(process.env.CHAINID)
      const userId = await this.generateId();
      console.log("userId: " + userId , "chainId: "+ chainId , "appId: " + appId ,"deviceId: " + deviceId) 
      if(!userId||!deviceId ||!appId|| !chainId){
        return res.status(400).json({ status: false, message: "Missing required fields" });
      }

      let privKey;
        privKey = sha512_256(appId + deviceId + userId);
        console.log("userId", userId, privKey, chainId);
        if(!privKey){
          return res.status(500).json({ status: false, message: "Error generating private key" });
        }


      let rpcHttpProvider, wallet;
        rpcHttpProvider = new ethers.providers.JsonRpcProvider(providerUrl);
        if (!rpcHttpProvider) {
          return res.status(500).json({ status: false, message: "Error creating RPC provider" });
        }
        wallet = new ethers.Wallet(privKey, rpcHttpProvider);
        if (!wallet) {
          return res.status(500).json({ status: false, message: "Error creating wallet" });
        }


      let account, client, eoa, chainName;
      try {
        account = privateKeyToAccount(wallet.privateKey);
        chainName = chainIdToChainName[chainId];  
        client = createWalletClient({
          account,
          chain: chainName,
          transport: http(),
        });

        eoa = client.account.address;
        console.log(`EOA address: ${eoa}`);
      } catch (error) {
        console.error("Error creating wallet client or retrieving account:", error);
        return res.status(500).json({ status: false, message: "Error creating wallet client or retrieving account" });
      }

      try {
        const bundlerUrl: any = chainIdToBundlerUrl[chainId];
        console.log(bundlerUrl, "Bundler URL");

        const smartAccount = await createSmartAccountClient({
          signer: client,
          bundlerUrl: bundlerUrl,
          chainId: chainId,
        });

        const saAddress = await smartAccount.getAccountAddress();
        console.log("SA Address", saAddress);

        const data = await dbservices.User.saveDetails(userId,appId,deviceId,saAddress)
        if(!data) throw new Error("Error In inserting Data")
        let token;
        try {
          token = await generateAuthTokens({ userId: data[0].userId});
          console.log({ token, userId, appId, deviceId, saAddress });
        } catch (error) {
          console.error("Error generating auth token:", error);
          return res.status(500).json({ status: false, message: "Error generating auth token" });
        }
        return res.status(200).send({
          message: "Details Saved",
          data: { userId, appId, deviceId, saAddress },
          token,
        });

      } catch (error) {
        console.error("Error creating Smart Account:", error);
        return res.status(500).json({ status: false, message: "Error creating Smart Account" });
      }

    } catch (error: any) {
      console.error("Unexpected error:", error);
      return res.status(500).json({ status: false, message: error.message || "Unexpected error occurred" });
    }
  };


  static registerGame = async(req: Request, res: Response): Promise<any>=>{
    try {
      console.log("registerGame called")
      const userId:any = req['user'].userId ;
      const evenId = await `event_${this.generateId()}`
      const gameName = req.body.gameName;
      const gameType = req.body.gameType;
      const eventDetails = req.body.eventDetails;
      const data = await dbservices.User.registerGame(userId, evenId, gameName, gameType, eventDetails)
      console.log(userId ,evenId ,gameName ,gameType);
      res.status(200).json({status:true , message: "game Registered!" , data: data});
    } catch (error:any) {
      console.error("Unexpected error:", error);
      return res.status(500).json({ status: false, message: error.message }); 
    }
  }


  static sendEvent = async( req:Request , res:Response): Promise<any> => {
    try {
      const userId = req['user'].userId;
      const eventId = req.params.eventId;
      const privateKey =  sha512_256("APPID" + "EVENTID"); // from addres which is always same as the all the transaction get pol from this address
      const data = await dbservices.User.getuserdetails(userId, eventId)
      const sa_address = data.saAddress
      const provider = new ethers.providers.JsonRpcProvider(providerUrl);
      console.log("Provider connected:", provider);
      const wallet = new ethers.Wallet(privateKey, provider);
      console.log(wallet.address, " permanent Wallet address")
      const gasPrice = await provider.getGasPrice();
      const encodedData = ethers.utils.toUtf8Bytes(JSON.stringify(data));
      const tx = {
        to: sa_address,
        value: ethers.utils.parseUnits("0"), 
        gasLimit : 25000, 
        gasPrice : gasPrice,
        data : ethers.utils.hexlify(encodedData)
      };
      console.log("Transaction Object:", tx);
      const txResponse = await wallet.sendTransaction(tx);
      console.log("Transaction Response:", txResponse);
      const txReceipt = await txResponse.wait();
      console.log("Transaction Receipt Hash:", txReceipt.transactionHash);
      console.log("Transaction Receipt Details:", txReceipt);
      const updateeventdata =  await dbservices.User.updateEventData(userId ,eventId ,txReceipt.transactionHash ,sa_address,wallet.address ,"0")
      // if(updateeventdata.length ===0){
      //   throw new Error("already transaction for this event")
      // }
      res.status(200).json({status: true, message: "Transaction done Successfuully", data: updateeventdata});
    } catch (error:any) {
      res.status(500).json({status:false, message: error.message})
    }
  }




  // static eventDetails: any = async (req: Request, res: Response) => {
  //   try {
  //     console.log("Event Details");
  //     let { appId, deviceId, userId, chainId } = req.body; 
  //     const privateKey =  sha512_256(appId + deviceId + userId);
  //     const eventId = this.generateId()
  //     const eventDetails = req.body
  //     const data = await dbservices.User.eventDetails(userId,eventId,eventDetails)
  //     const smartAccountAddress = data[0].saAddress; 
  //     const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  //     console.log("Provider connected:", provider);
  //     const wallet = new ethers.Wallet(privateKey, provider);
  //     const gasPrice = await provider.getGasPrice();

  //     const tx = {
  //       to: smartAccountAddress,
  //       value: ethers.utils.parseUnits("0"), 
  //       gasLimit : 21000, 
  //       gasPrice : gasPrice,
  //       data : JSON.stringify(data)
  //     };

  //     console.log("Transaction Object:", tx);
  //     const txResponse = await wallet.sendTransaction(tx);
  //     console.log("Transaction Response:", txResponse);


  //     const txReceipt = await txResponse.wait();
  //     console.log("Transaction Receipt Hash:", txReceipt.transactionHash);
  //     console.log("Transaction Receipt Details:", txReceipt);

  //     return res.status(200).json({ message: "Save Events Successfully", txReceipt });
  //   } catch (error: any) {
  //     console.error("Error occurred:", error);
  //     return res.status(500).json({
  //       status: false,
  //       message: error.message,
  //       stack: error.stack,
  //     });
  //   }
  // };


  static getdata: any = async (req: Request, res: Response) => {
    try{
      const data = await dbservices.User.getDta()
      return res.status(200).json({data:data})

    }catch(error:any){
      console.error("Error occurred:", error);
      return res.status(500).json({
        status: false,
        message: error.message,
        stack: error.stack,
      });
    }
  }


}
