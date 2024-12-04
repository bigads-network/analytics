"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = void 0;
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const envconfig_1 = require("./envconfig");
const logger_1 = __importDefault(require("./logger"));
// export let client = new Client({
//       host: envConfigs.db.host,
//       port: envConfigs.db.port,
//       user: envConfigs.db.user,
//       password: envConfigs.db.password,
//       database: envConfigs.db.database
//     });
// console.log(envConfigs.db_url);
exports.client = new pg_1.Client(envconfig_1.envConfigs.db_url);
exports.client
    .connect()
    .then(() => {
    logger_1.default.info(`Database connected successfully`);
})
    .catch((err) => {
    logger_1.default.error(`Error connecting to database: ${err}`);
});
const postgreDb = (0, node_postgres_1.drizzle)(exports.client);
exports.default = postgreDb;
//# sourceMappingURL=db.js.map