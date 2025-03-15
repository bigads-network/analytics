import {Request , Response } from 'express';
import dbservices from '../services/dbservices';

export default class Admin{

    static updateCreatorRequest = async(req: Request, res: Response): Promise<any> => {
        try {
          const { maAddress } = req.params;
          const { responseType } = req.body;
          const adminRole = req['user'].role;
    
          // Verify admin role
          if (adminRole !== 'admin') {
            return res.status(403).json({ 
              status: false, 
              message: "Only admin can process creator requests" 
            });
          }
    
          // Validate response type
          if (!['Approve', 'Reject'].includes(responseType)) {
            return res.status(400).json({
              status: false,
              message: "Invalid response type. Must be either 'Approve' or 'Reject'"
            });
          }
    
          let result;
          if (responseType === 'Approve') {
            // Update creator request and user role
            result = await dbservices.User.approveCreatorRequest(maAddress);
          } else {
            // Only update request status to rejected
            result = await dbservices.User.rejectCreatorRequest(maAddress);
          }
    
          if (!result) {
            return res.status(404).json({
              status: false,
              message: "Creator request not found"
            });
          }
    
          return res.status(200).json({
            status: true,
            message: `Creator request ${responseType.toLowerCase()}d successfully`,
            data: result
          });
    
        } catch (error: any) {
          return res.status(500).json({ 
            status: false, 
            message: error.message || "Unexpected error occurred" 
          });
        }
    }


    static getPendingRequests = async(req: Request, res: Response): Promise<any> => {
        try {
            const userRole = req['user'].role;
            const userId = req['user'].userId;
            

            if (userRole !== 'admin') {
                return res.status(403).json({
                    status: false,
                    message: "Access denied. Admin privileges required"
                });
            }

            // Check if user exists in user table
            const userExists = await dbservices.User.adminUserExists(userId);
           
            if (!userExists) {
                return res.status(404).json({
                    status: false,
                    message: "User not found"
                });
            }

            const requests = await dbservices.User.getPendingRequests();
            return res.status(200).json({
                status: true,
                message: "Pending requests fetch successful",
                data: requests
            });
        } catch (error: any) {
            console.error("Unexpected error:", error);
            return res.status(500).json({
                status: false,
                message: "Internal server error",
                error: error.message
            });
        }
  }

}