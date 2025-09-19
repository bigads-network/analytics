import express from "express";
import router from "./routes";
import cors from "cors"
import compression from 'compression';
import passport from "passport";
import { jwtStrategy } from "./config/token";
import { envConfigs } from "./config/envconfig";
import logger from "./config/logger";
import path from "path";
import swagger from "swagger-ui-express"
import apiDocs from "./config/swagger";
import './cronDashboardCacheWorker'; // Start dashboard cache cron worker automatically
import './cronGamesCacheWorker'; // Start games cache cron worker automatically
// import "./services/bot"; // Import bot instance

const app = express();

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



app.use(cors({ origin: "*"}));
passport.use('jwt', jwtStrategy);
app.use("/api-docs", swagger.serve, swagger.setup(apiDocs))
app.use("/", router);


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Adjust the path based on your project structure


app.listen(envConfigs.port, () => {
  logger.info(`Server started on ${envConfigs.port}`);
})
