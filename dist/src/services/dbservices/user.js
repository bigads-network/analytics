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
const db_1 = __importDefault(require("../../config/db"));
const schema_1 = require("../../models/schema");
class User {
}
exports.User = User;
_a = User;
User.saveDetails = (userId, appId, deviceId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield db_1.default.insert(schema_1.user).values({
            userId: userId,
            appId: appId,
            deviceId: deviceId
        }).returning({ userId: schema_1.user.userId });
        return result;
    }
    catch (error) {
        throw new Error(error);
    }
});
User.eventDetails = (userId, eventId, data) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield db_1.default.transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield tx
                .insert(schema_1.eventData)
                .values({
                userId: userId,
                eventId: eventId,
                name: data.name,
                type: data.type,
                eventDetails: data.eventDetails,
            })
                .execute();
            yield tx
                .insert(schema_1.userEvents)
                .values({
                userId: userId,
                eventId: eventId,
            })
                .onConflictDoNothing()
                .execute();
            return result;
        }));
    }
    catch (error) {
        throw new Error(error);
    }
});
//# sourceMappingURL=user.js.map