const { handleCommand } = require('./commands');

const WHISPER_PATTERN = /^\[.*\] (.*) whispers: (.*)$/;

function handleIncomingMessage(bot, jsonMsg) {
  const text = jsonMsg.toString();
  console.log('[MSG]', text);

  const whisperMatch = text.match(WHISPER_PATTERN);
  if (!whisperMatch) return;

  const [, username, message] = whisperMatch;
  handleCommand(bot, username, message, 'whisper').catch(console.error);
}

function registerChatHandlers(bot) {
  bot.on('chat', (username, message) => {
    handleCommand(bot, username, message, 'chat').catch(console.error);
  });

  bot.on('message', (jsonMsg) => handleIncomingMessage(bot, jsonMsg));
}

module.exports = {
  registerChatHandlers
};