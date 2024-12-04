"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.envConfigs = void 0;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const zod_1 = require("zod");
const envVarsSchema = zod_1.z.object({
    PORT: zod_1.z.string().default("80").transform((str) => parseInt(str, 10)),
    // HOST: z.string(),
    // DBUSER: z.string(),
    // PASSWORD: z.string(),
    // DATABASE: z.string(),
    // DBPORT: z.string().default("5432").transform((str) => parseInt(str, 10)),
    // SSL: z.enum(["true", "false"]).transform((str) => str === "true"),
    JWT_SECRET: zod_1.z.string(),
    EXPIREATION_MINUTE: zod_1.z.string(),
    DB_URL: zod_1.z.string(),
});
const envVars = envVarsSchema.parse(process.env);
exports.envConfigs = {
    port: envVars.PORT || 8080,
    // db: {
    //   host: envVars.HOST,
    //   user: envVars.DBUSER,
    //   password: envVars.PASSWORD,
    //   database:envVars.DATABASE,
    //   port: envVars.DBPORT,
    //   ssl: envVars.SSL,
    // },
    jwtsecret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.EXPIREATION_MINUTE,
    db_url: envVars.DB_URL,
};
//# sourceMappingURL=envconfig.js.map