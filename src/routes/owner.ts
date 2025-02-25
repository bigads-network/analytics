import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";
import { authenticateGameToken } from "../config/gameToken";

router.post('/registerCreator',validateRequest(validators.user.registerOwner),controllers.User.registerOwner); //done
router.post('/registerGame',authenticateUser,controllers.User.registerGame); //done
router.post('/sendEvents',authenticateUser,authenticateGameToken,controllers.User.sendEvents); //done
router.post('/events/:gameId',authenticateUser,controllers.User.eventCreation) //done
router.post('/gameToken',controllers.User.updateGameToken)




export default router