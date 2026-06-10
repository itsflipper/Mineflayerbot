const { handleCommand } = require('./commands');

function registerChatHandlers(bot) {
    bot.on('chat', (username, message) => {
        handleCommand(bot, username, message, 'chat').catch(console.error);
    });

    bot.on('message', (jsonMsg) => {
        const text = jsonMsg.toString();
        console.log('[MSG]', jsonMsg.toString());
        const whisperMatch = text.match(/^\[.*\] (.*) whispers: (.*)$/);
        if (whisperMatch) {
        const [,username, message] = whisperMatch;
        handleCommand(bot, username, message, 'whisper').catch(console.error);
        return;
        }
    });
}
module.exports = {
    registerChatHandlers
};