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
exports.validateRequest = exports.authenticateUser = exports.authenticateUserJwt = void 0;
const zod_1 = require("zod");
// import { getUser } from "../config/jwt";
const passport_1 = __importDefault(require("passport"));
const TokenHeaderSchema = zod_1.z.object({
    header: zod_1.z.object({
        authorization: zod_1.z.string().regex(/^Bearer\s+[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+$/, {
            message: "Invalid Authorization token format"
        })
    })
});
const validateRequestHeader = (schema) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokenHeader = req.headers['authorization'];
        yield schema.parseAsync({ header: { authorization: tokenHeader } });
        req.header['authorization'] = tokenHeader;
        next();
    }
    catch (error) {
        return res.status(400).send({ status: false, message: "Invalid Headers Authorization Token Missing." });
    }
});
const verifyCallback = (req, resolve, reject, res) => (err, user, info) => __awaiter(void 0, void 0, void 0, function* () {
    // console.log("Userrrrr...............",user);
    // console.log(info);
    if (err || info || !user) {
        return reject(new Error('UNAUTHOURIZED USER'));
    }
    req["user"] = user;
    resolve();
});
const authenticateUserJwt = () => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        passport_1.default.authenticate('jwt', { session: false }, verifyCallback(req, resolve, reject, res))(req, res, next);
    })
        .then(() => { next(); })
        .catch((err) => {
        if (res)
            return res.status(401).send({ status: false, message: "UNAUTHOURIZED USER" });
        next(err);
    });
});
exports.authenticateUserJwt = authenticateUserJwt;
exports.authenticateUser = [
    validateRequestHeader(TokenHeaderSchema),
    (0, exports.authenticateUserJwt)()
];
const validateRequest = (schema) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sanitizedValues = yield schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        req.body = sanitizedValues.body;
        req.query = sanitizedValues.query;
        req.params = sanitizedValues.params;
        return next();
    }
    catch (error) {
        const validationErrors = {};
        error.errors.forEach((errorMessage) => {
            const fieldName = errorMessage.path.join(".");
            validationErrors[fieldName] = errorMessage.message;
        });
        res.status(400).json({ errors: validationErrors });
    }
});
exports.validateRequest = validateRequest;
//# sourceMappingURL=index.js.map