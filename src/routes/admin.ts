import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";


router.patch('/creator-requests/:maAddress/approve',authenticateUser,validateRequest(validators.user.approveCreatorRequest),controllers.Admin.updateCreatorRequest); //done
router.get('/PendingRequests',authenticateUser,controllers.Admin.getPendingRequests) //done
router.get('/transactions',validateRequest(validators.user.transactions),controllers.Admin.transactions)//done
router.get('/count',controllers.Admin.count) //done
router.get('/games',controllers.Admin.games) //done
router.get('/events/:gameId',controllers.Admin.getEvents)

export default router