const commands = {
  bye: async ({ bot, reply }) => {
    bot.chat('Tschüss!');
    setTimeout(() => {
      bot.quit('Bot wurde verabschiedet');
    }, 300);
  },
  pos: async ({ bot,reply }) => {
    const pos = bot.entity.position;
    reply(`Meine aktuelle Position ist: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
  },
  ping: async ({ reply }) => {
      reply('Pong!');
  }
}

function parseCommand(message, source) {
    const text = message.trim();
    if (source === 'chat') {
        if (text.startsWith('!')) {
            const parts = text.slice(1).split(' ');
            return { commandName: parts[0].toLowerCase(), args: parts.slice(1), isPrivate: false };
        }
        if (text.startsWith('#')) {
            const parts = text.slice(1).split(' ');
            return { commandName: parts[0].toLowerCase(), args: parts.slice(1), isPrivate: true };
        }
        return null;
    }
    if (source === 'whisper') {
        const withoutPrefix = text.startsWith('!') ? text.slice(1) : text;
        const parts = withoutPrefix.split(' ');
        return { commandName: parts[0].toLowerCase(), args: parts.slice(1), isPrivate: true };
    }
    return null;
}

async function handleCommand(bot, username, message, source) {
  if (username === bot.username) return;
  const parsed = parseCommand(message, source);
  if (!parsed) return;
  const commandFn = commands[parsed.commandName];
  const reply = (text) => {
      if (source === 'whisper' || parsed.isPrivate) {
          bot.whisper(username, text);
      } else {
          bot.chat(text);
      }
  };
  if (!commandFn) {
      reply(`Unbekannter Befehl: ${parsed.commandName}`);
      return;
  }
  try {
      await commandFn({ 
          bot, 
          username,
          args: parsed.args, 
          source,
          reply
      });
  } catch (err) {
      console.error('[Command Error]', err);
      reply(`Fehler bei der Ausführung des Befehls: ${err.message}`);
  }
}
module.exports = {
    commands,
    parseCommand,
    handleCommand
};