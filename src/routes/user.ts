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


router.post('/registerGame',authenticateUser,controllers.User.registerGame); //creator



router.patch('/creator-requests/:maAddress/approve',authenticateUser,validateRequest(validators.user.approveCreatorRequest),controllers.User.approveCreatorRequest);  //admin
router.get('/getPendingRequests',authenticateUser,controllers.User.getPendingRequests) // admin
router.get('/transactions',validateRequest(validators.user.transactions),controllers.User.transactions)//admin
router.get('/count',controllers.User.count) //admin
router.get('/games',controllers.User.games) //admin





// router.get('/tokenTest' ,controllers.User.tokenTest)
// router.get('/data' , controllers.User.allData);
// router.get("/data",controllers.User.getdata)


export default router