const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./config.json');

function createBot() {
  const bot = mineflayer.createBot({
    host: config.bot.host,
    port: config.bot.port,
    username: config.bot.username,
    auth: config.bot.auth,
    version: config.bot.version
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);
    bot.chat('Bot ist online, schreibe !bye um mich zu verabschieden!');

    // Example: Move to a specific block (x=10, y=64, z=10)
    //const goal = new GoalBlock(10, 64, 10);
    // bot.pathfinder.setGoal(goal);
  });

  const commands = {
    bye: async () => {
      bot.chat('Tschüss!');
      setTimeout(() => {
        bot.quit('Bot wurde verabschiedet');
      }, 300);
    },
    pos: async ({ reply }) => {
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

  bot.on('kicked', (reason) => {
    console.log('Bot was kicked:', reason);
  });

  bot.on('error', (err) => {
    console.error('Error:', err);
  });

  bot.on('end', () => {
    console.log('Bot has been disconnected.');
  });

  return bot;
}

createBot();
