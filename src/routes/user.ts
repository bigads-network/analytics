import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";

router.post('/registerUser',controllers.User.registerUser);
router.post('/registerGame',authenticateUser ,controllers.User.registerGame);
router.get('/transactions',controllers.User.transactions)
router.post('/sendEvents',authenticateUser,controllers.User.sendEvents);
// router.get('/data' , controllers.User.allData);

// router.get("/data",controllers.User.getdata)


export default router