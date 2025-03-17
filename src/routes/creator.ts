import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";
import { authenticateGameToken } from "../config/gameToken";

// router.post('/registerCreator',validateRequest(validators.user.registerOwner),controllers.User.registerOwner); //done
router.post('/registerGame',authenticateUser,controllers.Creator.registerGame); //done // 
router.post('/events/:gameId',authenticateUser,controllers.Creator.eventCreation) //done
router.post('/gameToken',controllers.Creator.updateGameToken)
// router.post('/admin',controllers.User.adminlogin)




export default router