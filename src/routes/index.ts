import express, {Request, Response} from "express";
const router = express.Router();
import user from "./user"
import creator from "./owner"

const defaultRoutes = [
  {
    path: "/user",
    route: user,
  },
  {
    path: "/creator",
    route: creator
  }
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

router.get("/", async (req:Request, res: Response): Promise<any> => {
  return res.send("Server is running");
});


export default router;
