import TelegramBot from 'node-telegram-bot-api'; // Import the required module
import axios from 'axios';
import { envConfigs } from '../../config/envconfig';

const token = envConfigs.telegram_token; // Replace with your own bot token
const bot = new TelegramBot(token, { polling: true });


bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `Hello ${msg.from.first_name}! How can I assist you?`);
});

bot.onText(/\/events/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const response = await axios.get(`${process.env.BACKEND_URL}/user/events`);
        const { status, data } = response.data;

        if (!status || !data.length) {
            bot.sendMessage(chatId, "⚠️ No events found.");
            return;
        }


        let eventButtons = data.map(event => [
            { text: `📅 ${event.eventType} - ${event.game.Gamename}`, callback_data: event.eventId }
        ]);

        bot.sendMessage(chatId, "🎮 *Select an Event:*", {
            reply_markup: { inline_keyboard: eventButtons },
            parse_mode: "Markdown"
        });

    } catch (error) {
        console.error("API Error:", error);
        bot.sendMessage(chatId, "❌ Failed to fetch events. Please try again later.");
    }

    bot.on("callback_query", async (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const eventId = callbackQuery.data;
    
        try {
            const response = await axios.get(`${process.env.BACKEND_URL}/user/events`);
            const { data } = response.data;
            const event = data.find(event => event.eventId === eventId);
    
            if (!event) {
                bot.sendMessage(chatId, "⚠️ Event not found.");
                return;
            }
    
            let eventDetails = `🎮 *Event Details:*\n\n`;
            eventDetails += `📅 *Event:* ${event.eventType}\n`;
            eventDetails += `🕹 *Game Name:* ${event.game.Gamename}\n`;
            eventDetails += `🎯 *Type:* ${event.game.Gametype}\n`;
            eventDetails += `📖 *Description:* ${event.game.description}\n`;
    
            bot.sendMessage(chatId, eventDetails, { parse_mode: "Markdown" });
    
        } catch (error) {
            console.error("API Error:", error);
            bot.sendMessage(chatId, "❌ Failed to fetch event details.");
        }
    });
    
});

console.log("Telegram bot is running...");


export default bot;
