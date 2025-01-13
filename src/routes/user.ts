import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser } from "../middleware";

router.post("/registerUser",controllers.User.registerUser)
router.post("/registerGame",authenticateUser,controllers.User.registerGame)
router.post("/sendEvent/:eventId" ,authenticateUser, controllers.User.sendEvent)
// router.post("savequstion",controllers.User.saveQue)
router.get("/data",controllers.User.getdata)


export default router