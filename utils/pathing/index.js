const { createMovements } = require('./movementFactory');
const { getProfileForBot } = require('./profileSelector');
const { tryDoorRetry, tryDoorPreCheck } = require('./doorHandler');
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
// Goto mit PreCheck + Retry
// ---------------------------------------------------------------------

const STUCK_DISTANCE_EPSILON = 0.25;
const MAX_STUCK_ATTEMPTS = 3;

function hasBotMoved(positionBefore, positionAfter) {
  return positionBefore.distanceTo(positionAfter) > STUCK_DISTANCE_EPSILON;
}

function createStuckError(goal) {
  return new Error(`pathfinderGoto: stuck after ${MAX_STUCK_ATTEMPTS} attempts, goal: ${JSON.stringify(goal)}`);
}

async function _runPreCheckAndGoto(bot, goal, goalVec, worldId) {
  const preCheck = await tryDoorPreCheck(bot, goalVec, { setProfileFn: setMovementProfile });
  if (!preCheck.success) return false;

  if (worldId) applyAutomaticProfile(bot, worldId);
  await _gotoRaw(bot, goal);
  return true;
}

async function _retryWithDoor(bot, goal, goalVec, worldId) {
  const retryResult = await tryDoorRetry(bot, goalVec, { setProfileFn: setMovementProfile });
  if (!retryResult.success) return false;

  if (worldId) applyAutomaticProfile(bot, worldId);
  await _gotoRaw(bot, goal);
  return true;
}

async function _attemptGoto(bot, goal, goalVec, worldId) {
  if (worldId) applyAutomaticProfile(bot, worldId);

  const preHandled = await _runPreCheckAndGoto(bot, goal, goalVec, worldId);
  if (preHandled) return;

  try {
    await _gotoRaw(bot, goal);
  } catch (firstError) {
    const retryHandled = await _retryWithDoor(bot, goal, goalVec, worldId);
    if (!retryHandled) throw firstError;
  }
}

async function pathfinderGoto(bot, goal, worldId) {
  const goalVec = goalToVec(goal, bot.entity.position.floored());
  let stuckAttempts = 0;

  while (true) {
    const positionBefore = bot.entity.position.clone();

    try {
      await _attemptGoto(bot, goal, goalVec, worldId);
      return;
    } catch (_err) {
      // fall through to stuck check
    }

    if (hasBotMoved(positionBefore, bot.entity.position)) {
      stuckAttempts = 0;
      continue;
    }

    stuckAttempts++;
    if (stuckAttempts >= MAX_STUCK_ATTEMPTS) throw createStuckError(goal);
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