import {envConfigs} from "./src/config/envConfig"


export default ({
  dialect: "postgresql", 
  schema: "./src/models/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: envConfigs.db.host,
    user: envConfigs.db.user,
    password: envConfigs.db.password,
    database: envConfigs.db.database,
    port: envConfigs.db.port,
    ssl: envConfigs.db.ssl ,
    // url:envConfigs.db.url
  },
});