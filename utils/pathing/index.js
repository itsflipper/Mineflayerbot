const { createMovements } = require('./movementFactory');
const { getProfileForBot } = require('./profileSelector');
const { tryDoorRetry } = require('./doorHandler');
const { Vec3 } = require('vec3');

const DEFAULT_PROFILE = 'safePathfinder';

// ---------------------------------------------------------------------
// Profil-Verwaltung
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// Direkter Pathfinder-Zugriff (nur hier erlaubt)
// ---------------------------------------------------------------------

async function _gotoRaw(bot, goal) {
  await bot.pathfinder.goto(goal);
}

function pathfinderSetMovements(bot, movements) {
  bot.pathfinder.setMovements(movements);
}

function pathfinderStop(bot) {
  if (!bot.pathfinder) return;
  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
}

// ---------------------------------------------------------------------
// goalToVec – robuste Vec3-Extraktion aus beliebigen Goal-Objekten
// ---------------------------------------------------------------------

function goalToVec(goal, fallback) {
  if (!goal) return fallback;
  if (typeof goal.toVec === 'function') return goal.toVec();
  if (Number.isFinite(goal.x) && Number.isFinite(goal.y) && Number.isFinite(goal.z)) {
    return new Vec3(Math.floor(goal.x), Math.floor(goal.y), Math.floor(goal.z));
  }
  return fallback;
}

// ---------------------------------------------------------------------
// Goto mit Tür-Retry
// ---------------------------------------------------------------------

async function _retryWithDoor(bot, goal, worldId) {
  const goalVec = goalToVec(goal, bot.entity.position.floored());

  const retryResult = await tryDoorRetry(bot, goalVec, {
    setProfileFn: setMovementProfile
  });

  if (!retryResult.success) return false;

  // Profil wiederherstellen und weiter zum ursprünglichen Ziel
  if (worldId) applyAutomaticProfile(bot, worldId);
  await _gotoRaw(bot, goal);
  return true;
}

async function pathfinderGoto(bot, goal, worldId) {
  if (worldId) applyAutomaticProfile(bot, worldId);

  try {
    await _gotoRaw(bot, goal);
    return;
  } catch (firstError) {
    const handled = await _retryWithDoor(bot, goal, worldId);
    if (!handled) throw firstError;
  }
}

function pathfinderSetGoal(bot, goal, dynamic = false, worldId) {
  if (worldId) applyAutomaticProfile(bot, worldId);
  bot.pathfinder.setGoal(goal, dynamic);
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