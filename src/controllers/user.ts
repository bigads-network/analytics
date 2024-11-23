import { Request, Response } from "express";
import dbservices from "../services/dbservices";
import { generateAuthTokens } from "../config/token";

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
      let {appId,deviceId,userId} = req.body
      if(!userId) userId = this.generateId()
      const data = await dbservices.User.saveDetails(userId,appId,deviceId)
      if(!data) throw new Error("Error In inserting Data")
      const token = await generateAuthTokens({userId:data[0].userId})  
      return res.status(200).send({message:"Details Save",data:data,token})
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
      if(!data) throw new Error("Error In inserting Data")
      return res.status(200).json({message:"save Events Successfully"})
    }catch(error:any){
      // console.log(error);
     return res.status(500).json({ status: false, message: error.mesage });
    }
  }


}