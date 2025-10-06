import express, {Request, Response} from "express";
import { provisionQueue } from "../controllers/user";
const router = express.Router();
import user from "./user"
import creator from "./creator"
import dashboard from "./dashboard"

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

router.get("/", async (req:Request, res: Response): Promise<any> => {
  return res.send("Server is running");
});

// Simple health endpoint with queue depths
router.get("/healthz", async (req: Request, res: Response): Promise<any> => {
  try {
    // Lazy import to avoid circular init issues if any
    const { default: UserController } = await import("../controllers/user");
    const { globalBatch: gb, provisionQueue: pq } = await import("../controllers/user");
    return res.status(200).json({
      status: "ok",
      queues: {
        provisionQueueLength: (pq as any).length,
        globalBatchLength: (gb as any).transactions.length,
      },
    });
  } catch (error) {
    return res.status(200).json({ status: "ok" });
  }
});


export default router;
