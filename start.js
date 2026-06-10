const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./config.json');

const { registerChatHandlers } = require('./chatHandler');

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

  bot.once('spawn', () => {
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);
    bot.chat('Bot ist online, schreibe !bye um mich zu verabschieden!');

    // Example: Move to a specific block (x=10, y=64, z=10)
    //const goal = new GoalBlock(10, 64, 10);
    // bot.pathfinder.setGoal(goal);
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
