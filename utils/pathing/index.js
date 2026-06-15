const { createMovements } = require('./movementFactory');
const { getProfileForBot } = require('./profileSelector');
const { tryDoorRetry, tryDoorPreCheck } = require('./doorHandler');
const { tryTowerRetry } = require('./towerHandler');
const { Vec3 } = require('vec3');

const DEFAULT_PROFILE = 'safePathfinder';

const STUCK_DISTANCE_EPSILON = 0.25;
const MAX_STUCK_ATTEMPTS = 3;

const GOTO_DONE  = 'GOTO_DONE';
const GOTO_RETRY = 'GOTO_RETRY';

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
// goalToVec
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
// Goto-Strategien (Extraction)
// ---------------------------------------------------------------------

// Fix 1: Tower-Fallback wird VOR dem normalen Pathfinder-Aufruf geprüft.
// Pathfinder kann beim Höhenproblem hängen, ohne jemals einen Fehler zu
// werfen - dann würde der Tower-Fallback im catch-Zweig nie erreicht.
async function _tryTowerPreCheck(bot, goalVec) {
  const result = await tryTowerRetry(bot, goalVec);
  if (!result?.success) return null;

  return GOTO_RETRY;
}

async function _tryPreCheck(bot, goal, goalVec, worldId) {
  const result = await tryDoorPreCheck(bot, goalVec, { setProfileFn: setMovementProfile });
  if (!result.success) return null;

  if (worldId) applyAutomaticProfile(bot, worldId);
  await _gotoRaw(bot, goal);
  return GOTO_DONE;
}

async function _tryDoorRetry(bot, goal, goalVec, worldId) {
  const result = await tryDoorRetry(bot, goalVec, { setProfileFn: setMovementProfile });
  if (!result?.success) return null;

  if (worldId) applyAutomaticProfile(bot, worldId);
  await _gotoRaw(bot, goal);
  return GOTO_DONE;
}

async function _tryTowerRetry(bot, goalVec) {
  const result = await tryTowerRetry(bot, goalVec);
  if (!result?.success) return null;

  return GOTO_RETRY;
}

// ---------------------------------------------------------------------
// Ein einzelner Goto-Versuch
// ---------------------------------------------------------------------

async function _attemptGoto(bot, goal, goalVec, worldId) {
  if (worldId) applyAutomaticProfile(bot, worldId);

  // Fix 1: Tower-Pre-Check vor jedem regulären Pathfinder-Versuch.
  const towerPreCheckResult = await _tryTowerPreCheck(bot, goalVec);
  if (towerPreCheckResult) return towerPreCheckResult;

  const preCheckResult = await _tryPreCheck(bot, goal, goalVec, worldId);
  if (preCheckResult) return preCheckResult;

  try {
    await _gotoRaw(bot, goal);
    return GOTO_DONE;
  } catch (firstError) {
    const doorResult = await _tryDoorRetry(bot, goal, goalVec, worldId);
    if (doorResult) return doorResult;

    const towerResult = await _tryTowerRetry(bot, goalVec);
    if (towerResult) return towerResult;

    throw firstError;
  }
}

// ---------------------------------------------------------------------
// Stuck-Erkennung (Extraction)
// ---------------------------------------------------------------------

function hasBotMoved(before, after) {
  return before.distanceTo(after) > STUCK_DISTANCE_EPSILON;
}

function createStuckError(goal) {
  return new Error(`pathfinderGoto: stuck after ${MAX_STUCK_ATTEMPTS} attempts, goal: ${JSON.stringify(goal)}`);
}

function isStuck(stuckAttempts) {
  return stuckAttempts >= MAX_STUCK_ATTEMPTS;
}

// ---------------------------------------------------------------------
// pathfinderGoto – Haupt-Loop
// ---------------------------------------------------------------------

async function pathfinderGoto(bot, goal, worldId) {
  const goalVec = goalToVec(goal, bot.entity.position.floored());
  let stuckAttempts = 0;

  while (true) {
    const positionBefore = bot.entity.position.clone();

    let attemptResult = null;
    try {
      attemptResult = await _attemptGoto(bot, goal, goalVec, worldId);
    } catch (_err) {
      // fall through to stuck check
    }

    if (attemptResult === GOTO_DONE) return;

    if (attemptResult === GOTO_RETRY) {
      // Fix 4: ein erfolgreicher Tower-/Retry-Step ist echter Fortschritt.
      stuckAttempts = 0;
      continue;
    }

    if (hasBotMoved(positionBefore, bot.entity.position)) {
      stuckAttempts = 0;
      continue;
    }

    stuckAttempts++;
    if (isStuck(stuckAttempts)) throw createStuckError(goal);
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