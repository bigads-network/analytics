import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser } from "../middleware";

router.post("/saveuser",controllers.User.saveDetails)
router.post("/saveevents",authenticateUser,controllers.User.eventDetails)
// router.post("savequstion",controllers.User.saveQue)

export default router