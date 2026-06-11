const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const config = require('./config.json');

const { registerChatHandlers } = require('./chatHandler');

function setupPathfinderMovements(bot) {
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.pathfinder.setMovements(defaultMove);
}

function registerLifecycleHandlers(bot) {
  bot.on('kicked', (reason) => {
    console.log('Bot was kicked:', reason);
  });

  bot.on('error', (err) => {
    console.error('Error:', err);
  });

  bot.on('end', () => {
    console.log('Bot has been disconnected.');
  });
}

function createBot() {
  const bot = mineflayer.createBot({
    host: config.bot.host,
    port: config.bot.port,
    username: config.bot.username,
    auth: config.bot.auth,
    version: config.bot.version
  });

  bot.loadPlugin(pathfinder);
  registerChatHandlers(bot);
  registerLifecycleHandlers(bot);

  bot.once('spawn', () => {
    setupPathfinderMovements(bot);
    bot.chat('Bot is online, say !help for commands!');
  });

  return bot;
}

createBot();