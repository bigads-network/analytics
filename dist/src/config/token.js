"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jwtStrategy = exports.generateAuthTokens = void 0;
const passport_jwt_1 = require("passport-jwt");
const moment_1 = __importDefault(require("moment"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const envconfig_1 = require("./envconfig");
const enums_1 = require("../enums");
const generateAuthTokens = (payload) => {
    const accessTokenExpires = (0, moment_1.default)().add(envconfig_1.envConfigs.accessExpirationMinutes, "minutes");
    const accessToken = jsonwebtoken_1.default.sign(JSON.stringify({
        userId: payload.userId,
        type: enums_1.TokenTypes.ACCESS, // Include the token type
        exp: accessTokenExpires.unix() // Set expiration time in UNIX timestamp format
    }), envconfig_1.envConfigs.jwtsecret);
    return accessToken;
};
exports.generateAuthTokens = generateAuthTokens;
const jwtOptions = {
    secretOrKey: envconfig_1.envConfigs.jwtsecret,
    jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
};
const jwtVerify = (payload, done) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // console.log(payload ,"payloadddd")
        if (payload.type !== enums_1.TokenTypes.ACCESS) {
            throw new Error('Invalid token type');
        }
        done(null, payload);
    }
    catch (error) {
        done(error, false);
    }
});
exports.jwtStrategy = new passport_jwt_1.Strategy(jwtOptions, jwtVerify);
//# sourceMappingURL=token.js.map