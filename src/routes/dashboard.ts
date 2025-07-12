import express from "express";
import controllers from "../controllers";
import { dashboardDuplicatePrevention } from "../middleware/preventDuplicates";

const router = express.Router();

// Apply duplicate prevention middleware to all dashboard routes
router.use(dashboardDuplicatePrevention);

// Unified dashboard endpoint - returns all data at once
router.get("/all", controllers.Dashboard.getAllDashboardData);

// Progressive loading endpoint - uses Server-Sent Events
// Note: SSE doesn't need duplicate prevention as it's a stream
router.get("/stream", controllers.Dashboard.getDashboardDataProgressive);

// Individual metrics endpoints (optional - for specific needs)
router.get("/user-counts", controllers.Dashboard.getUserCounts);

export default router; 