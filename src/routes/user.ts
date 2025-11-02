import express from "express"
import { authenticateUser, validateRequest } from "../middleware"
import controllers from "../controllers"
import { authenticateGameToken } from "../config/gameToken"
import validators from "../validators"
import { dashboardDuplicatePrevention } from "../middleware/preventDuplicates"
const router=express.Router()



// router.get('/test/:gameId',controllers.User.test)

router.get('/game', controllers.User.games) // Get all games - Batman
router.get('/events', controllers.User.events)
router.get('/transactions', controllers.User.transactions)
router.get('/self', controllers.User.self)
router.get('/count' , dashboardDuplicatePrevention, controllers.User.count) // Get total number of users - Batman
router.get('/event/transaction/:eventId', controllers.User.eventTransaction)
router.get('/transacttion/:userId', controllers.User.GetUserTransacttion)
router.get("/game/transaction/:gameId",controllers.User.GetGameTransacttion)
router.post('/fireEvent/:eventId',validateRequest(validators.user.fireEvent),controllers.User.fireEvent)
// router.post('/fireEvent/:eventId' , controllers.Test.fireEvent)
// router.get('/Blockchain', controllers.Test.allEventblockchain)
router.get('/duneActiveUser', dashboardDuplicatePrevention, controllers.TransactionXDC.getDailyActiveUsers) // Dune Analytics for active users - Batman
router.get('/duneActiveEvents', dashboardDuplicatePrevention, controllers.TransactionXDC.getDailyTransactionCounts) // Dune Analytics for active events - Batman
// router.get('/test', controllers.Test.test)
// router.get("/transactions/day", controllers.Test.totalTransactionsperdat)


router.get("/monthlyuser", dashboardDuplicatePrevention, controllers.TransactionXDC.getMonthlyUsers) // Dune Analytics for monthly active users - Batman
router.get("/monthlytransaction", dashboardDuplicatePrevention, controllers.TransactionXDC.getMonthlyTransaction) // Dune Analytics for monthly transactions - Batman


router.post("/reset-nonce" , controllers.User.resetNonce) // Reset nonce - Batman


export default router