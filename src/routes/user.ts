import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";

router.post("/registerUser",validateRequest(validators.user.registerUser),controllers.User.registerUser)
router.post("/registerGame",authenticateUser,controllers.User.registerGame)
router.post("/sendEvent/:eventId" ,validateRequest(validators.user.sendEvent),authenticateUser, controllers.User.sendEvent)
router.get("/data",controllers.User.getdata)


export default router