const { commands: basicCommands } = require('./basic');
const { commands: baseRegistrationCommands, hasPendingNameRequest, resolvePendingName } = require('./baseRegistration');
const { commands: taskCommands } = require('./tasks');
const { commands: movementCommands } = require('./movement');
const { commands: inventoryCommands } = require('./inventory');
const { commands: craftingCommands } = require('./crafting');
const { REPLIES } = require('../replies');

function formatCommandEntry(name, commandEntry) {
  if (commandEntry.aliases.length === 0) return name;
  return `${name} (${commandEntry.aliases.join(', ')})`;
}

function getSortedCommandNames() {
  return Object.keys(commands).sort((a, b) => a.localeCompare(b));
}

function formatHelpText() {
  return getSortedCommandNames()
    .map(name => formatCommandEntry(name, commands[name]))
    .join(' | ');
}

async function runHelpCommand({ reply }) {
  reply(REPLIES.availableCommands(formatHelpText()));
}

const commands = {
  ...basicCommands,
  ...baseRegistrationCommands,
  ...taskCommands,
  ...movementCommands,
  ...inventoryCommands,
  ...craftingCommands,
  help: {
    description: 'Lists all available commands.',
    aliases: ['commands', 'h'],
    run: runHelpCommand
  }
};

function resolveCommandName(inputName) {
  const name = inputName.toLowerCase();

  if (commands[name]) return name;

  const match = Object.entries(commands)
    .find(([, command]) => command.aliases.includes(name));

  return match ? match[0] : null;
}

function splitMessageIntoParts(text) {
  const parts = text.split(' ').filter(Boolean);

  return {
    commandName: parts[0]?.toLowerCase(),
    args: parts.slice(1)
  };
}

function parseChatCommand(text) {
  if (text.startsWith('!')) {
    return { ...splitMessageIntoParts(text.slice(1)), isPrivate: false };
  }

  if (text.startsWith('#')) {
    return { ...splitMessageIntoParts(text.slice(1)), isPrivate: true };
  }

  return null;
}

function parseWhisperCommand(text) {
  const commandText = text.startsWith('!') ? text.slice(1) : text;
  return { ...splitMessageIntoParts(commandText), isPrivate: true };
}

function parseCommand(message, source) {
  const text = message.trim();

  if (source === 'chat') return parseChatCommand(text);
  if (source === 'whisper') return parseWhisperCommand(text);

  return null;
}

function createReply(bot, username, source, isPrivate) {
  return (text) => {
    if (source === 'whisper' || isPrivate) {
      bot.whisper(username, text);
      return;
    }

    bot.chat(text);
  };
}

function isBotMessage(bot, username) {
  return username === bot.username;
}

function looksLikeCommand(text) {
  return text.startsWith('!') || text.startsWith('#');
}

function shouldResolvePendingName(username, text) {
  if (!hasPendingNameRequest(username)) return false;
  return !looksLikeCommand(text);
}

async function runCommand(commandEntry, context) {
  await commandEntry.run(context);
}

async function handlePendingName(bot, username, text, source) {
  const reply = createReply(bot, username, source, source === 'whisper');
  return resolvePendingName(username, text, reply);
}

async function handleParsedCommand(bot, username, source, parsed) {
  const reply = createReply(bot, username, source, parsed.isPrivate);
  const realCommandName = resolveCommandName(parsed.commandName);

  if (!realCommandName) {
    reply(REPLIES.unknownCommand(parsed.commandName));
    return;
  }

  const commandEntry = commands[realCommandName];

  try {
    await runCommand(commandEntry, { bot, username, args: parsed.args, source, reply });
  } catch (err) {
    console.error('[Command Error]', err);
    reply(REPLIES.commandError(err.message));
  }
}

async function handleCommand(bot, username, message, source) {
  if (isBotMessage(bot, username)) return;

  const text = message.trim();

  if (shouldResolvePendingName(username, text)) {
    return handlePendingName(bot, username, text, source);
  }

  const parsed = parseCommand(message, source);

  if (!parsed) return;

  return handleParsedCommand(bot, username, source, parsed);
}

module.exports = {
  commands,
  parseCommand,
  handleCommand
};