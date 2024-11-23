    import { drizzle } from "drizzle-orm/node-postgres";
    import { Client } from "pg";
    import * as schema from "../models/schema";
    import { envConfigs } from "./envconfig";
    import logger from "./logger";
    export let client = new Client({
          host: envConfigs.db.host,
          port: envConfigs.db.port,
          user: envConfigs.db.user,
          password: envConfigs.db.password,
          database: envConfigs.db.database
        });
    // export const client = new Client(envConfigs.databaseUrl);

    client
    .connect()
    .then(() => {
        logger.info(`Database connected successfully`);
    })
    .catch((err) => {
        logger.error(`Error connecting to database: ${err}`);
    });

    const postgreDb = drizzle(client);

    export default postgreDb;
