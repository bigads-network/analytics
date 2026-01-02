import express, {Request, Response} from "express";
const router = express.Router();
import user from "./user"
import creator from "./creator"
import dashboard from "./dashboard"
import controllers from "../controllers"

const defaultRoutes = [
  {
    path: "/user",
    route: user,
  },
  {
    path: "/creator",
    route: creator
  },
  {
    path: "/dashboard",
    route: dashboard
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

// Monitoring endpoints
router.get('/health/queue', controllers.Monitoring.getQueueStatus);
router.get('/health', controllers.Monitoring.getHealthStatus);
router.post('/health/reset', controllers.Monitoring.resetStats);

router.get("/", async (req:Request, res: Response): Promise<any> => {
  return res.send("Server is running");
});


export default router;
