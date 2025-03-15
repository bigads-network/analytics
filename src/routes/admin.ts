import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";


router.patch('/creator-requests/:maAddress',authenticateUser,validateRequest(validators.user.approveCreatorRequest),controllers.Admin.updateCreatorRequest); //done
router.get('/PendingRequests',authenticateUser,controllers.Admin.getPendingRequests) //done
router.get('/count',controllers.User.count) //done
router.get('/games',controllers.User.games) //done
router.get('/creator-request-status/:userId',controllers.User.getCreatorRequestStatus)



export default router