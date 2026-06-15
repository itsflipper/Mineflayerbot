const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');

const config = require('./config');
const { registerChatHandlers } = require('./chat/chatHandler');
const { botState, handleSpawn, handleDeath } = require('./state/botState');
const taskRunner = require('./tasks/taskRunner');
const recoverDeathItems = require('./tasks/recoverDeathItems');
const craftPlaceCraftingTable = require('./tasks/craftPlaceCraftingTable');
const { installPathing } = require('./actions/navigation');

// ---------------------------------------------------------------------
// Fehlerbehandlung
// ---------------------------------------------------------------------

function handleUncaughtException(error) {
  console.error('[Uncaught Exception]', error);
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

// ---------------------------------------------------------------------
// Auto-Start Task
// ---------------------------------------------------------------------

function getAutoStartTask() {
  if (botState.lastDeathPosition) return recoverDeathItems;
  if (botState.inventoryEmpty) return craftPlaceCraftingTable;
  return null;
}

async function runAutoStartTask(bot) {
  if (!config.autoStart) return;

  const task = getAutoStartTask();
  if (!task) return;

  taskRunner.start(task);
  await taskRunner.tick(bot);
}

// ---------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------

async function handleFirstSpawn(bot) {
  installPathing(bot, 'safePathfinder');
  handleSpawn(bot);
  await runAutoStartTask(bot);
}

// ---------------------------------------------------------------------
// Bot-Setup
// ---------------------------------------------------------------------

function createBotOptions() {
  return {
    host: config.bot.host,
    port: config.bot.port,
    username: config.bot.username,
    auth: config.bot.auth,
    version: config.bot.version
  };
}

function registerLifecycleHandlers(bot) {
  bot.on('kicked', handleKick);
  bot.on('error', handleError);
  bot.on('end', handleEnd);
  bot.on('death', () => handleDeath(bot));
}

function registerSpawnHandler(bot) {
  bot.once('spawn', () => {
    handleFirstSpawn(bot).catch(handleError);
  });
}

function setupBot(bot) {
  bot.loadPlugin(pathfinder);
  registerChatHandlers(bot);
  registerLifecycleHandlers(bot);
  registerSpawnHandler(bot);
}

function createBot() {
  const bot = mineflayer.createBot(createBotOptions());
  setupBot(bot);
  return bot;
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------

process.on('uncaughtException', handleUncaughtException);
createBot();