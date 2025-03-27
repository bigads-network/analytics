import express from "express"
import { authenticateUser, validateRequest } from "../middleware"
import controllers from "../controllers"
import { authenticateGameToken } from "../config/gameToken"
import validators from "../validators"
const router=express.Router()



// router.get('/test/:gameId',controllers.User.test)

router.get('/game', controllers.User.games)
router.get('/events', controllers.User.events)
router.get('/transactions', controllers.User.transactions)
router.get('/self', controllers.User.self)
router.get('/count' , controllers.User.count)
router.get('/event/transaction/:eventId', controllers.User.eventTransaction)
router.get('/transacttion/:userId', controllers.User.GetUserTransacttion)
router.get("/game/transaction/:gameId",controllers.User.GetGameTransacttion)
router.post('/fireEvent/:eventId' ,validateRequest(validators.user.fireEvent),controllers.User.fireEvent)


export default router