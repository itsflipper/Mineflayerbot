const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');

const config = require('./config');
const { registerChatHandlers } = require('./chat/chatHandler');
const { botState, handleSpawn, handleDeath } = require('./state/botState');
const taskRunner = require('./tasks/taskRunner');
const recoverDeathItems = require('./tasks/recoverDeathItems');
const craftPlaceCraftingTable = require('./tasks/craftPlaceCraftingTable');

function handleUncaughtException(error) {
  console.error('[Uncaught Exception]', error);
}

function registerProcessHandlers() {
  process.on('uncaughtException', handleUncaughtException);
}

function createBotOptions() {
  return {
    host: config.bot.host,
    port: config.bot.port,
    username: config.bot.username,
    auth: config.bot.auth,
    version: config.bot.version
  };
}

function loadPlugins(bot) {
  bot.loadPlugin(pathfinder);
}

function createMovements(bot) {
  const mcData = require('minecraft-data')(bot.version);
  return new Movements(bot, mcData);
}

function setupPathfinderMovements(bot) {
  bot.pathfinder.setMovements(createMovements(bot));
}

function handleKick(reason) {
  console.warn('[Kicked]', reason);
}

function handleError(error) {
  console.error('[Bot Error]', error);
}

function handleEnd() {
  console.warn('[Disconnected]');
}

function registerLifecycleHandlers(bot) {
  bot.on('kicked', handleKick);
  bot.on('error', handleError);
  bot.on('end', handleEnd);
  bot.on('death', () => handleDeath(bot));
}

function getAutoStartTask() {
  if (botState.lastDeathPosition) return recoverDeathItems;
  if (botState.inventoryEmpty) return craftPlaceCraftingTable;
  return null;
}

async function runTaskOnce(bot, task) {
  taskRunner.start(task);
  return taskRunner.tick(bot);
}

async function runAutoStartTask(bot) {
  if (!config.autoStart) return;

  const task = getAutoStartTask();

  if (!task) return;

  await runTaskOnce(bot, task);
}

async function handleFirstSpawn(bot) {
  setupPathfinderMovements(bot);
  handleSpawn(bot);
  await runAutoStartTask(bot);
}

function registerSpawnHandler(bot) {
  bot.once('spawn', () => {
    handleFirstSpawn(bot).catch(handleError);
  });
}

function setupBot(bot) {
  loadPlugins(bot);
  registerChatHandlers(bot);
  registerLifecycleHandlers(bot);
  registerSpawnHandler(bot);
}

function createBot() {
  const bot = mineflayer.createBot(createBotOptions());
  setupBot(bot);
  return bot;
}

registerProcessHandlers();
createBot();