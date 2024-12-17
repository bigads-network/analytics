import { Request, Response } from "express";
import dbservices from "../services/dbservices";
import { generateAuthTokens } from "../config/token";
import {sha512_256} from "js-sha512"
import { ethers } from "ethers";
import {Hex, WalletClient, createWalletClient, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import { chainIdToBundlerUrl, chainIdToChainName, providerUrl } from "../config/envconfig";
import {createSmartAccountClient} from "@biconomy/account"

export class User {
  static generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

  static testRoute:any = async(req:Request,res:Response)=>{
    try{
      return res.status(200).send({message:"Api is Running...",status:true})
    }catch(error){
      return res.status(500).send({message:"Api Giving Error",status:false})
    }
  }

  static saveDetails: any = async (req: Request, res: Response) => {
    try {
      let { appId, deviceId, userId, chainId } = req.body;
  
      // Generate userId if not provided
      if (!userId) {
        try {
          userId = this.generateId();
        } catch (error) {
          console.error("Error generating userId:", error);
          return res.status(500).json({ status: false, message: "Error generating userId" });
        }
      }
  
      // Generate private key
      let privKey;
      try {
        privKey = sha512_256(appId + deviceId + userId);
        console.log("userId", userId, privKey, chainId);
      } catch (error) {
        console.error("Error generating private key:", error);
        return res.status(500).json({ status: false, message: "Error generating private key" });
      }
  
      // Create RPC provider and wallet
      let rpcHttpProvider, wallet;
      try {
        rpcHttpProvider = new ethers.providers.JsonRpcProvider("https://1rpc.io/matic");
        console.log(rpcHttpProvider, "rpc url");
  
        wallet = new ethers.Wallet(privKey, rpcHttpProvider);
        console.log(wallet, "walletttt");
      } catch (error) {
        console.error("Error initializing wallet or RPC provider:", error);
        return res.status(500).json({ status: false, message: "Error initializing wallet or RPC provider" });
      }
  
      // Create account and wallet client
      let account, client, eoa, chainName;
      try {
        account = privateKeyToAccount(wallet.privateKey);
        chainName = chainIdToChainName[chainId];
        console.log("chainName: ", chainName);
  
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
  
      // Create Smart Account
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
  
        const data = await dbservices.User.saveDetails(userId,appId,deviceId,)
        if(!data) throw new Error("Error In inserting Data")
        // Generate token
        let token;
        try {
          token = await generateAuthTokens({ userId: userId:data[0].userId});
          console.log({ token, userId, appId, deviceId, saAddress });
        } catch (error) {
          console.error("Error generating auth token:", error);
          return res.status(500).json({ status: false, message: "Error generating auth token" });
        }
  
        // Respond success
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
  

  static eventDetails: any = async (req: Request, res: Response) => {
    try {
      console.log("Event Details");
      let { appId, deviceId, userId, chainId } = req.body; 
      const privateKey =  sha512_256(appId + deviceId + userId);
      const eventId = this.generateId()
      const eventDetails = req.body
      const data = await dbservices.User.eventDetails(userId,eventId,eventDetails)

      
      const smartAccountAddress = data[0].saAddress; // Replace with your logic to get the address
      const providerUrl = "https://polygon-amoy.g.alchemy.com/v2/Xd8ZnMNV7j_YL-2K-Fr-VqUnXDG1k1_Z"; // Replace with your actual provider URL
      const provider = new ethers.providers.JsonRpcProvider(providerUrl);
      console.log("Provider connected:", provider);
  
      // const walletPrivateKey = "436196098217ec2ecdd0687ba282c1a5e39584e703dcf56a421fc9592de7c6f5"; // Private key of your wallet
      const wallet = new ethers.Wallet(privateKey, provider);
      console.log("Wallet Address:", wallet.address);
      const gasPrice = await provider.getGasPrice();
      
      const tx = {
        to: smartAccountAddress,
        value: ethers.utils.parseUnits("0"), // 0 value
        gasLimit : 21000, // Minimum gas for a transaction
        gasPrice : gasPrice,
        data : JSON.stringify(data)
      };
  
      console.log("Transaction Object:", tx);

  
      // Send transaction
      const txResponse = await wallet.sendTransaction(tx);
      console.log("Transaction Response:", txResponse);
  
      // Wait for confirmation
      const txReceipt = await txResponse.wait();
      console.log("Transaction Receipt Hash:", txReceipt.transactionHash);
      console.log("Transaction Receipt Details:", txReceipt);
  
      return res.status(200).json({ message: "Save Events Successfully", txReceipt });
    } catch (error: any) {
      console.error("Error occurred:", error);
      return res.status(500).json({
        status: false,
        message: error.message,
        stack: error.stack,
      });
    }
  };
  


}