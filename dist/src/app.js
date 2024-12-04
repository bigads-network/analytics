"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const routes_1 = __importDefault(require("./routes"));
const cors_1 = __importDefault(require("cors"));
const passport_1 = __importDefault(require("passport"));
const token_1 = require("./config/token");
const envconfig_1 = require("./config/envconfig");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cors_1.default)({ origin: "*" }));
passport_1.default.use('jwt', token_1.jwtStrategy);
app.use("/", routes_1.default);
app.listen(envconfig_1.envConfigs.port, () => {
    console.log(`Server started on ${envconfig_1.envConfigs.port}`);
});
//# sourceMappingURL=app.js.map