const { handleCommand } = require('./commands');

const WHISPER_PATTERN = /^\[.*\] (.*) whispers: (.*)$/;

function parseWhisper(text) {
  const match = text.match(WHISPER_PATTERN);

  if (!match) return null;

  const [, username, message] = match;
  return { username, message };
}

function handleCommandError(error) {
  console.error('[Chat Handler Error]', error);
}

function runCommand(bot, username, message, source) {
  handleCommand(bot, username, message, source).catch(handleCommandError);
}

function handleIncomingMessage(bot, jsonMsg) {
  const whisper = parseWhisper(jsonMsg.toString());

  if (!whisper) return;

  runCommand(bot, whisper.username, whisper.message, 'whisper');
}

function registerPublicChatHandler(bot) {
  bot.on('chat', (username, message) => {
    runCommand(bot, username, message, 'chat');
  });
}

function registerWhisperHandler(bot) {
  bot.on('message', (jsonMsg) => {
    handleIncomingMessage(bot, jsonMsg);
  });
}

function registerChatHandlers(bot) {
  registerPublicChatHandler(bot);
  registerWhisperHandler(bot);
}

module.exports = {
  registerChatHandlers
};