import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";
import { authenticateGameToken } from "../config/gameToken";


router.post('/registerUser',validateRequest(validators.user.registerUser),controllers.User.registerUser); //done         // user
router.post('/requestCreator',validateRequest(validators.user.requestCreator),controllers.User.requestCreator);//done    // user
router.post('/sendEvents',authenticateUser,authenticateGameToken,controllers.User.sendEvents);   // user


router.get('/creator-request-status/:userId',controllers.User.getCreatorRequestStatus) //  dont make swaager for this request


export default router