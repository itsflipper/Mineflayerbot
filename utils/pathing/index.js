const { createMovements } = require('./movementFactory');
const { getProfileForBot } = require('./profileSelector');

const DEFAULT_PROFILE = 'safePathfinder';

function installPathing(bot, profileName = DEFAULT_PROFILE) {
  const movements = createMovements(bot, profileName);
  bot.pathfinder.setMovements(movements);
}

function setMovementProfile(bot, profileName) {
  const movements = createMovements(bot, profileName);
  bot.pathfinder.setMovements(movements);
}

function applyAutomaticProfile(bot, worldId) {
  const profileName = getProfileForBot(bot, worldId);
  setMovementProfile(bot, profileName);
}

async function pathfinderGoto(bot, goal, worldId) {
  if (worldId) applyAutomaticProfile(bot, worldId);
  await bot.pathfinder.goto(goal);
}

function pathfinderSetGoal(bot, goal, dynamic = false, worldId) {
  if (worldId) applyAutomaticProfile(bot, worldId);
  bot.pathfinder.setGoal(goal, dynamic);
}

function pathfinderSetMovements(bot, movements) {
  bot.pathfinder.setMovements(movements);
}

function pathfinderStop(bot) {
  if (!bot.pathfinder) return;
  bot.pathfinder.setGoal(null);
}

module.exports = {
  installPathing,
  setMovementProfile,
  applyAutomaticProfile,
  pathfinderGoto,
  pathfinderSetGoal,
  pathfinderSetMovements,
  pathfinderStop
};