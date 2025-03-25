import express from "express"
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import { authenticateGameToken } from "../config/gameToken";
import validators from "../validators";
const router=express.Router()

router.post('/register',validateRequest(validators.creator.registerCreator),controllers.Creator.creatorRegister); 
router.post("/game", validateRequest(validators.creator.gameSchema),authenticateUser,controllers.Creator.gameRegister);
router.post("/events",validateRequest(validators.creator.eventSchema),authenticateUser,authenticateGameToken,controllers.Creator.eventsRegister);


export default router