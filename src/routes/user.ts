import express from "express"
const router=express.Router()
import controllers from "../controllers";
import { authenticateUser, validateRequest } from "../middleware";
import validators from "../validators";

router.post('/registerUser',validateRequest(validators.user.registerUser),controllers.User.registerUser); //done
router.post('/requestCreator',validateRequest(validators.user.requestCreator),controllers.User.requestCreator);//done
router.post('/registerGame',authenticateUser,controllers.User.registerGame); //done
router.get('/transactions',validateRequest(validators.user.transactions),controllers.User.transactions)//done

router.patch(
  '/creator-requests/:maAddress/approve',
  authenticateUser,
  validateRequest(validators.user.approveCreatorRequest),
  controllers.User.approveCreatorRequest
); //done

router.get('/getPendingRequests',authenticateUser,controllers.User.getPendingRequests) //done
router.get('/count',controllers.User.count) //done
router.get('/games',controllers.User.games) //done
router.get('/creator-request-status/:userId',controllers.User.getCreatorRequestStatus)


// router.get('/tokenTest' ,controllers.User.tokenTest)
// router.get('/data' , controllers.User.allData);

// router.get("/data",controllers.User.getdata)


export default router