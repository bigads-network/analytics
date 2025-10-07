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

// Create a dedicated read client connected to the read replica
export const readClient = new Client(envConfigs.db_read || envConfigs.db_url);
readClient
.connect()
.then(() => {
    logger.info(`Read replica connected successfully`);
})
.catch((err) => {
    logger.error(`Error connecting to read replica: ${err}`);
});

const postgreDb = drizzle(client,{ schema: { ...schema } });
export const postgreDbRead = drizzle(readClient,{ schema: { ...schema } });

export default postgreDb;