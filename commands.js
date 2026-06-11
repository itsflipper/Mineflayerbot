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
        .map(name => {
            const commandEntry = commands[name];
            const aliases = commandEntry.aliases.length > 0
              ? ` (${commandEntry.aliases.join(', ')})`
                : '';
                return `${name}${aliases}`;
            })
        .join(' | ');
      reply (`Available commands: ${helpText}`);
    }
  },
  pos: {
    description: 'Displays the bot\'s current position.',
    aliases: ['position'],
    run: async ({ bot,reply }) => {
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

function resolveCommandsName (inputName) {
    const name = inputName.toLowerCase();
    if (commands[name]) return name;
    for (const commandName of Object.keys(commands)) {
        const command = commands[commandName];
        if (command.aliases && command.aliases.includes(name)) {
            return commandName;
        }
    }
    return null;
}

function parseCommand(message, source) {
    const text = message.trim();
    if (source === 'chat') {
        if (text.startsWith('!')) {
            const parts = text.slice(1).split(' ').filter(Boolean);
            return { commandName: parts[0].toLowerCase(), args: parts.slice(1), isPrivate: false };
        }
        if (text.startsWith('#')) {
            const parts = text.slice(1).split(' ').filter(Boolean);
            return { commandName: parts[0].toLowerCase(), args: parts.slice(1), isPrivate: true };
        }
        return null;
    }
    if (source === 'whisper') {
        const withoutPrefix = text.startsWith('!') ? text.slice(1) : text;
        const parts = withoutPrefix.split(' ').filter(Boolean);
        return { commandName: parts[0].toLowerCase(), args: parts.slice(1), isPrivate: true };
    }
    return null;
}

async function handleCommand(bot, username, message, source) {
  if (username === bot.username) return;
  const parsed = parseCommand(message, source);
  if (!parsed) return;
  const realCommandName = resolveCommandsName(parsed.commandName);
  const reply = (text) => {
      if (source === 'whisper' || parsed.isPrivate) {
          bot.whisper(username, text);
      } else {
          bot.chat(text);
      }
  };
  if (!realCommandName) {
      reply(`Unknown command: ${parsed.commandName}`);
      return;
  }
  const commandEntry = commands[realCommandName];
  try {
      await commandEntry.run({ 
          bot, 
          username,
          args: parsed.args, 
          source,
          reply
      });
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