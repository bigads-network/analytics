import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";
import { authenticateGameToken } from "../config/gameToken";

router.post('/registerCreator',validateRequest(validators.user.registerOwner),controllers.User.registerOwner);
router.post('/registerGame',authenticateUser,controllers.User.registerGame);
router.post('/sendEvents',authenticateUser,authenticateGameToken,controllers.User.sendEvents);
router.post('/events/:gameId',authenticateUser,controllers.User.eventCreation)
router.post('/gameToken',controllers.User.updateGameToken)




export default router