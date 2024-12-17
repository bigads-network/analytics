import express from "express";
import router from "./routes";
import cors from "cors"
import passport from "passport";
import { jwtStrategy } from "./config/token";
import { envConfigs } from "./config/envconfig";
import logger from "./config/logger";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({ origin: "*"}));
passport.use('jwt', jwtStrategy);

app.use("/", router);

app.listen(envConfigs.port, () => {
  logger.info(`Server started on ${envConfigs.port}`);
});
