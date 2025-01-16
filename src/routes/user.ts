import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";

router.post('/registerUser',validateRequest(validators.user.registerUser),controllers.User.registerUser);
router.post('/registerGame',validateRequest(validators.user.registerGame),authenticateUser,controllers.User.registerGame);
router.post('/sendEvents',validateRequest(validators.user.sendEvent),authenticateUser,controllers.User.sendEvents);
router.get('/transactions',validateRequest(validators.user.transactions),controllers.User.transactions)
router.get('/count',controllers.User.count)
router.get('/games',controllers.User.games)
// router.get('/data' , controllers.User.allData);

// router.get("/data",controllers.User.getdata)


export default router