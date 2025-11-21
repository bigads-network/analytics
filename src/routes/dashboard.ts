import express from "express";
import controllers from "../controllers";

const router = express.Router();

// Unified dashboard endpoint - returns all data at once
router.get("/all", controllers.Dashboard.getAllDashboardData);
router.get("/avax", controllers.Dashboard.getAllDashboardDataAVAX); // Alias for convenience

// Progressive loading endpoint - uses Server-Sent Events
// Note: SSE doesn't need duplicate prevention as it's a stream
router.get("/stream", controllers.Dashboard.getDashboardDataProgressive);

// Individual metrics endpoints (optional - for specific needs)
router.get("/user-counts", controllers.Dashboard.getUserCounts);

export default router; 