import express, {Request, Response} from "express";
const router = express.Router();
import user from "./user"

const defaultRoutes = [
  {
    path: "/user",
    route: user,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

router.get("/", async (req:Request, res: Response): Promise<any> => {
  return res.send("Server is running");
});


export default router;
