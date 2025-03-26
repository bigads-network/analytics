import express from "express"
import { authenticateUser, validateRequest } from "../middleware"
import controllers from "../controllers"
import { authenticateGameToken } from "../config/gameToken"
import validators from "../validators"
const router=express.Router()



// router.get('/test/:gameId',controllers.User.test)

router.get('/game', controllers.User.games)
router.get('/events', controllers.User.events)
router.post('/fireEvent/:eventId' ,validateRequest(validators.user.fireEvent),controllers.User.fireEvent)


export default router