import { Request, Response } from "express";
import dbservices from "../services/dbservices";
import { generateAuthTokens } from "../config/token";
import {sha512_256} from "js-sha512"
import ethers from "ethers"
import {Hex, WalletClient, createWalletClient, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import { chainIdToBundlerUrl, chainIdToChainName } from "../config/envconfig";
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

  static saveDetails:any = async(req:Request,res:Response)=>{
    try{
      // console.log("varun")
      let {appId,deviceId,userId, chainId} = req.body
      if(!userId) userId = this.generateId()
            const privKey = sha512_256(
              appId+deviceId+userId 
            )
        
            const rpcHttpProvider=new ethers.providers.JsonRpcProvider("http://localhost:8545");
            
            const wallet :any= new ethers.Wallet(privKey, rpcHttpProvider);

            const account = privateKeyToAccount(wallet.privateKey);
            const chainName = chainIdToChainName[chainId]
            console.log('chainName: ', chainName);
              const client = createWalletClient({
                account,
                chain: chainName,
                transport: http(),
              });
              const eoa = client.account.address;
              console.log(`EOA address: ${eoa}`);
            
              const bundlerUrl:any = chainIdToBundlerUrl[chainId]
              console.log(bundlerUrl , "Bundler URL")
              const smartAccount = await createSmartAccountClient({
                signer: client,
                bundlerUrl:bundlerUrl,
                chainId:chainId
              });
              const saAddress = await smartAccount.getAccountAddress();
              console.log("SA Address", saAddress)
      const data = await dbservices.User.saveDetails(userId,appId,deviceId)
      if(!data) throw new Error("Error In inserting Data")
      const token = await generateAuthTokens({userId:data[0].userId})  
      return res.status(200).send({message:"Details Save",data:data,token:token,saAddress:saAddress})
    }catch(error:any){
      // console.log("Error::",error)
      return res.status(500).json({ status: false, message: error});
    }
  }

  static eventDetails:any = async(req:Request,res:Response)=>{
    try{
      const userId = req["user"]["userId"];  
      const eventId = this.generateId()
      const eventDetails = req.body
      const data = await dbservices.User.eventDetails(userId,eventId,eventDetails)

    const smartAccountAddress = eventDetails.smartAccountAddress; // Replace with your logic to get the address
    const provider = new ethers.providers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL); // Blockchain provider
    const walletPrivateKey = process.env.WALLET_PRIVATE_KEY; // Private key of your wallet
    const wallet = new ethers.Wallet(walletPrivateKey, provider);

    const tx = {
      to: smartAccountAddress,
      value: ethers.utils.parseEther("0"), // 0 value
      gasLimit: 21000, // Minimum gas for a transaction
    };

    // Send transaction
    const txResponse = await wallet.sendTransaction(tx);
    const txReceipt = await txResponse.wait(); // Wait // Wait for transaction confirmation

      if(!data) throw new Error("Error In inserting Data")
      return res.status(200).json({message:"save Events Successfully"})
    }catch(error:any){
      // console.log(error);
     return res.status(500).json({ status: false, message: error.mesage });
    }
  }


}