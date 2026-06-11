const commands = {
  bye: {
    description: 'Disconnects the bot.',
    aliases: ['exit', 'quit', 'leave'],
    run: async ({ bot, reply }) => {
      reply('Bye!');
      setTimeout(() => {
        bot.quit('Bot has disconnected.');
      }, 300);
    }
  },
  help: {
    description: 'Lists all available commands.',
    aliases: ['commands', 'h'],
    run: async ({ reply }) => {
      const commandNames = Object.keys(commands).sort((a, b) => a.localeCompare(b));
      const helpText = commandNames
        .map(name => formatCommandEntry(name, commands[name]))
        .join(' | ');
      reply(`Available commands: ${helpText}`);
    }
  },
  pos: {
    description: 'Displays the bot\'s current position.',
    aliases: ['position'],
    run: async ({ bot, reply }) => {
      const pos = bot.entity.position;
      reply(`x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
    }
  },
  ping: {
    description: 'Replies with Pong!',
    aliases: [],
    run: async ({ reply }) => {
      reply('Pong!');
    }
  },
};

function formatCommandEntry(name, commandEntry) {
  if (commandEntry.aliases.length === 0) return name;
  return `${name} (${commandEntry.aliases.join(', ')})`;
}

function resolveCommandsName(inputName) {
  const name = inputName.toLowerCase();
  if (commands[name]) return name;

  const match = Object.entries(commands)
    .find(([, command]) => command.aliases.includes(name));

  return match ? match[0] : null;
}

function splitMessageIntoParts(text) {
  const parts = text.split(' ').filter(Boolean);
  return { commandName: parts[0]?.toLowerCase(), args: parts.slice(1) };
}

function parseCommand(message, source) {
  const text = message.trim();

  if (source === 'chat') {
    if (text.startsWith('!')) {
      const { commandName, args } = splitMessageIntoParts(text.slice(1));
      return { commandName, args, isPrivate: false };
    }
    if (text.startsWith('#')) {
      const { commandName, args } = splitMessageIntoParts(text.slice(1));
      return { commandName, args, isPrivate: true };
    }
    return null;
  }

  if (source === 'whisper') {
    const withoutPrefix = text.startsWith('!') ? text.slice(1) : text;
    const { commandName, args } = splitMessageIntoParts(withoutPrefix);
    return { commandName, args, isPrivate: true };
  }

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

async function handleCommand(bot, username, message, source) {
  if (username === bot.username) return;

  const parsed = parseCommand(message, source);
  if (!parsed) return;

  const reply = createReply(bot, username, source, parsed.isPrivate);

  const realCommandName = resolveCommandsName(parsed.commandName);
  if (!realCommandName) {
    reply(`Unknown command: ${parsed.commandName}`);
    return;
  }

  const commandEntry = commands[realCommandName];
  try {
    await commandEntry.run({ bot, username, args: parsed.args, source, reply });
  } catch (err) {
    console.error('[Command Error]', err);
    reply(`Error occurred while executing the command: ${err.message}`);
  }
}

module.exports = {
  commands,
  parseCommand,
  handleCommand
};