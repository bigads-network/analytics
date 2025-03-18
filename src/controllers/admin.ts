import { Request, Response } from "express";
import dbservices from "../services/dbservices/admin";

export default class Admin {
  static updateCreatorRequest = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const { maAddress } = req.params;
      const { responseType } = req.body;
      const adminRole = req["user"].role;

      // Verify admin role
      if (adminRole !== "admin") {
        return res.status(403).json({
          status: false,
          message: "Only admin can process creator requests",
        });
      }

      // Validate response type
      if (!["Approve", "Reject"].includes(responseType)) {
        return res.status(400).json({
          status: false,
          message:
            "Invalid response type. Must be either 'Approve' or 'Reject'",
        });
      }

      let result;
      if (responseType === "Approve") {
        // Update creator request and user role
        result = await dbservices.approveCreatorRequest(maAddress);
      } else {
        // Only update request status to rejected
        result = await dbservices.rejectCreatorRequest(maAddress);
      }

      if (!result) {
        return res.status(404).json({
          status: false,
          message: "Creator request not found",
        });
      }

      return res.status(200).json({
        status: true,
        message: `Creator request ${responseType.toLowerCase()}d successfully`,
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        status: false,
        message: error.message || "Unexpected error occurred",
      });
    }
  }; // done

  static getPendingRequests = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const userRole = req["user"].role;
      const userId = req["user"].userId;

      if (userRole !== "admin") {
        return res.status(403).json({
          status: false,
          message: "Access denied. Admin privileges required",
        });
      }

      // Check if user exists in user table
      const userExists = await dbservices.adminUserExists(userId);

      if (!userExists) {
        return res.status(404).json({
          status: false,
          message: "User not found",
        });
      }

      const requests = await dbservices.getPendingRequests();
      return res.status(200).json({
        status: true,
        message: "Pending requests fetch successful",
        data: requests,
      });
    } catch (error: any) {
      console.error("Unexpected error:", error);
      return res.status(500).json({
        status: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }; //done

  static transactions: any = async (req: Request, res: Response) => {
    try {
      const transactionDetails = await dbservices.getTransactionDetails();
      res
        .status(200)
        .json({
          status: true,
          message: "transaction fetch successful",
          data: transactionDetails,
        });
    } catch (error) {
      return res
        .status(500)
        .json({
          status: false,
          message: error.message || "Unexpected error occurred",
        });
    }
  };  //done

  static count = async (req: Request, res: Response): Promise<any> => {
    try {
      const count = await dbservices.counts();
      res
        .status(200)
        .json({ status: true, message: "count fetch successful", data: count });
    } catch (error: any) {
      console.error("Unexpected error:", error);
      return res
        .status(500)
        .json({ status: false, message: error || "Unexpected error occurred" });
    }
  }; //done

  static games = async (req: Request, res: Response): Promise<any> => {
    try {
      const count = await dbservices.games();
      res
        .status(200)
        .json({ status: true, message: "count fetch successful", data: count });
    } catch (error: any) {
      console.error("Unexpected error:", error);
      return res
        .status(500)
        .json({ status: false, message: error || "Unexpected error occurred" });
    }
  }; // done

  static getEvents = async (req: Request, res: Response): Promise<any> => {
    try {
      const gameId = req.params.gameId;
      const events = await dbservices.getEvents(gameId);

      if (!events) {
        return res.status(404).json({
          status: false,
          message: "Events not found for the given game",
        });
      }

      return res.status(200).json({
        status: true,
        message: "Events fetched successfully",
        data: events,
      });
    } catch (error) {
      console.error("Unexpected error:", error);
      return res.status(500).json({
        status: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }; //done
}
