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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const dbservices_1 = __importDefault(require("../services/dbservices"));
const token_1 = require("../config/token");
class User {
}
exports.User = User;
_a = User;
User.generateId = () => Math.random().toString(36).substr(2, 8).toUpperCase();
User.testRoute = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return res.status(200).send({ message: "Api is Running...", status: true });
    }
    catch (error) {
        return res.status(500).send({ message: "Api Giving Error", status: false });
    }
});
User.saveDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // console.log("varun")
        let { appId, deviceId, userId } = req.body;
        if (!userId)
            userId = _a.generateId();
        const data = yield dbservices_1.default.User.saveDetails(userId, appId, deviceId);
        if (!data)
            throw new Error("Error In inserting Data");
        const token = yield (0, token_1.generateAuthTokens)({ userId: data[0].userId });
        return res.status(200).send({ message: "Details Save", data: data, token });
    }
    catch (error) {
        // console.log("Error::",error)
        return res.status(500).json({ status: false, message: error });
    }
});
User.eventDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req["user"]["userId"];
        const eventId = _a.generateId();
        const eventDetails = req.body;
        const data = yield dbservices_1.default.User.eventDetails(userId, eventId, eventDetails);
        if (!data)
            throw new Error("Error In inserting Data");
        return res.status(200).json({ message: "save Events Successfully" });
    }
    catch (error) {
        // console.log(error);
        return res.status(500).json({ status: false, message: error.mesage });
    }
});
//# sourceMappingURL=user.js.map