    import { drizzle } from "drizzle-orm/node-postgres";
    import { Client } from "pg";
    import * as schema from "../models/schema";
    import { envConfigs } from "./envconfig";
    import logger from "./logger";

    export const client = new Client(envConfigs.db_url);
    client
    .connect()
    .then(() => {
        logger.info(`Database connected successfully`);
    })
    .catch((err) => {
        logger.error(`Error connecting to database: ${err}`);
    });

    const postgreDb = drizzle(client,{ schema: { ...schema } });

    export default postgreDb;
