const { Vec3 } = require('vec3');
const { goals: { GoalBlock } } = require('mineflayer-pathfinder');
const { waitTicks } = require('../timing');

const DOOR_SEARCH_RADIUS = 15;
const TOGGLE_COOLDOWN_MS = 1000;

// ---------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------

function getProps(block) {
  if (!block) return {};
  if (typeof block.getProperties === 'function') return block.getProperties();
  return block._properties || block.properties || {};
}

// ---------------------------------------------------------------------
// Block-Erkennung
// ---------------------------------------------------------------------

function isNormalDoor(block) {
  if (!block || !block.name) return false;
  if (!block.name.endsWith('_door')) return false;
  if (block.name.includes('_trapdoor')) return false;
  if (block.name.includes('gate')) return false;
  return true;
}

function isLowerDoorHalf(block) {
  return getProps(block).half !== 'upper';
}

function isDoorOpen(block) {
  const val = getProps(block).open;
  return val === true || val === 'true' || val === 1 || val === '1';
}

// ---------------------------------------------------------------------
// Block normalisieren – immer untere Hälfte
// ---------------------------------------------------------------------

function getLowerDoorBlock(bot, pos) {
  const block = bot.blockAt(pos);
  if (!block) return null;

  if (getProps(block).half === 'upper') return bot.blockAt(pos.offset(0, -1, 0));

  const below = bot.blockAt(pos.offset(0, -1, 0));
  if (below && isNormalDoor(below)) return below;

  return block;
}

// ---------------------------------------------------------------------
// Suche
// ---------------------------------------------------------------------

function findNearbyDoors(bot, radius = DOOR_SEARCH_RADIUS) {
  const pos = bot.entity.position.floored();

  return bot.findBlocks({
    matching: block => isNormalDoor(block) && isLowerDoorHalf(block),
    maxDistance: radius,
    count: 20,
    point: pos
  }).map(vec => bot.blockAt(vec)).filter(Boolean);
}

// ---------------------------------------------------------------------
// Tür-Auswahl
// ---------------------------------------------------------------------

function scoreDoor(door, bot, goalVec) {
  const botPos = bot.entity.position;
  const doorPos = door.position;
  const toGoal = goalVec.minus(botPos).normalize();
  const toDoor = doorPos.minus(botPos).normalize();
  const alignment = toGoal.dot(toDoor);
  const distance = botPos.distanceTo(doorPos);
  return alignment * 10 - distance;
}

function chooseBestDoor(bot, doors, goalVec) {
  if (doors.length === 0) return null;
  return doors.reduce((best, door) =>
    scoreDoor(door, bot, goalVec) > scoreDoor(best, bot, goalVec) ? door : best
  );
}

// ---------------------------------------------------------------------
// Durchgangspositions-Berechnung
// ---------------------------------------------------------------------

const CARDINAL_OFFSETS = [
  new Vec3(0, 0, -1),
  new Vec3(0, 0,  1),
  new Vec3( 1, 0,  0),
  new Vec3(-1, 0,  0)
];

function isWalkable(bot, pos) {
  const feet = bot.blockAt(pos);
  const head = bot.blockAt(pos.offset(0, 1, 0));
  if (!feet || !head) return false;
  return feet.boundingBox === 'empty' && head.boundingBox === 'empty';
}

function getWalkableNeighbours(bot, doorPos) {
  return CARDINAL_OFFSETS
    .map(offset => doorPos.plus(offset))
    .filter(pos => isWalkable(bot, pos));
}

function areSensibleSides(approachSide, exitSide) {
  const dx = Math.abs(approachSide.x - exitSide.x);
  const dz = Math.abs(approachSide.z - exitSide.z);
  return dx + dz >= 2;
}

function getOppositeSide(doorPos, approachSide) {
  const dx = approachSide.x - doorPos.x;
  const dz = approachSide.z - doorPos.z;
  return doorPos.offset(-dx, 0, -dz);
}

function getTransitSides(bot, doorBlock, goalVec) {
  const doorPos = doorBlock.position;
  const neighbours = getWalkableNeighbours(bot, doorPos);

  if (neighbours.length < 2) return null;

  const botPos = bot.entity.position;

  const approachSide = neighbours.reduce((closest, pos) =>
    botPos.distanceTo(pos) < botPos.distanceTo(closest) ? pos : closest
  );

  const opposite = getOppositeSide(doorPos, approachSide);
  const oppositeWalkable = neighbours.find(pos => pos.equals(opposite));
  const remaining = neighbours.filter(pos => !pos.equals(approachSide));

  const exitSide = oppositeWalkable
    ?? remaining.reduce((closest, pos) =>
        goalVec.distanceTo(pos) < goalVec.distanceTo(closest) ? pos : closest
      );

  if (!areSensibleSides(approachSide, exitSide)) return null;

  return { approachSide, exitSide };
}

// ---------------------------------------------------------------------
// Cooldown gegen Doppeltoggle
// ---------------------------------------------------------------------

const recentlyToggled = new Map();

function isOnCooldown(doorPos) {
  const key = doorPos.toString();
  const last = recentlyToggled.get(key);
  return last !== undefined && Date.now() - last < TOGGLE_COOLDOWN_MS;
}

function markToggled(doorPos) {
  const key = doorPos.toString();
  recentlyToggled.set(key, Date.now());
  setTimeout(() => recentlyToggled.delete(key), TOGGLE_COOLDOWN_MS * 2);
}

// ---------------------------------------------------------------------
// Interner Toggle
// ---------------------------------------------------------------------

async function _toggleDoor(bot, doorBlock) {
  if (isOnCooldown(doorBlock.position)) return { success: false, reason: 'door_toggle_cooldown' };

  await bot.lookAt(doorBlock.position.offset(0.5, 0.5, 0.5), true);
  await bot.activateBlock(doorBlock);
  markToggled(doorBlock.position);
  await waitTicks(bot, 4);

  return { success: true };
}

// ---------------------------------------------------------------------
// Zielzustand erzwingen
// ---------------------------------------------------------------------

async function ensureDoorOpen(bot, pos) {
  const door = getLowerDoorBlock(bot, pos);
  if (!door || !isNormalDoor(door)) return { success: false, reason: 'not_a_door' };
  if (isDoorOpen(door)) return { success: true, alreadyOpen: true };

  await _toggleDoor(bot, door);

  const after = getLowerDoorBlock(bot, pos);
  if (isDoorOpen(after)) return { success: true, opened: true };
  return { success: false, reason: 'door_did_not_open' };
}

async function ensureDoorClosed(bot, pos) {
  const door = getLowerDoorBlock(bot, pos);
  if (!door || !isNormalDoor(door)) return { success: false, reason: 'not_a_door' };
  if (!isDoorOpen(door)) return { success: true, alreadyClosed: true };

  recentlyToggled.delete(door.position.toString());
  await _toggleDoor(bot, door);

  const after = getLowerDoorBlock(bot, pos);
  if (!isDoorOpen(after)) return { success: true, closed: true };
  return { success: false, reason: 'door_did_not_close' };
}

// ---------------------------------------------------------------------
// Approach per Pathfinder (nur bis vor die Tür)
// ---------------------------------------------------------------------

async function gotoBlockExact(bot, pos) {
  const goal = new GoalBlock(pos.x, pos.y, pos.z);
  await bot.pathfinder.goto(goal);
}

// ---------------------------------------------------------------------
// Manueller Transit
// ---------------------------------------------------------------------

async function manualStepToward(bot, targetPos) {
  await bot.lookAt(targetPos.offset(0.5, 1.0, 0.5), true);
  bot.setControlState('forward', true);
  await waitTicks(bot, 10);
  bot.setControlState('forward', false);
  await waitTicks(bot, 2);
}

async function manualStepThroughDoor(bot, exitSide) {
  const center = exitSide.offset(0.5, 0, 0.5);

  for (let i = 0; i < 3; i++) {
    if (bot.entity.position.distanceTo(center) < 1.0) return { success: true };
    await manualStepToward(bot, exitSide);
  }

  return { success: bot.entity.position.distanceTo(center) < 1.5 };
}

// ---------------------------------------------------------------------
// Transit
// ---------------------------------------------------------------------

async function walkThroughDoor(bot, doorBlock, goalVec) {
  const sides = getTransitSides(bot, doorBlock, goalVec);
  if (!sides) return { success: false, reason: 'no_valid_transit_sides' };

  const { approachSide, exitSide } = sides;
  const doorPos = doorBlock.position;

  await gotoBlockExact(bot, approachSide);

  const wasOpen = isDoorOpen(getLowerDoorBlock(bot, doorPos));

  const openResult = await ensureDoorOpen(bot, doorPos);
  if (!openResult.success) return openResult;

  bot.pathfinder.setGoal(null);
  bot.clearControlStates();
  await waitTicks(bot, 1);

  let transitResult;
  try {
    transitResult = await manualStepThroughDoor(bot, exitSide);
  } finally {
    if (!wasOpen) await ensureDoorClosed(bot, doorPos);
  }

  if (!transitResult?.success) return { success: false, reason: 'transit_failed' };
  return { success: true };
}

// ---------------------------------------------------------------------
// Retry-Einstiegspunkt
// ---------------------------------------------------------------------

async function tryDoorRetry(bot, goalVec, options = {}) {
  const { setProfileFn } = options;

  if (setProfileFn) setProfileFn(bot, 'doorSearch');

  const doors = findNearbyDoors(bot);
  const door = chooseBestDoor(bot, doors, goalVec);

  if (!door) return { success: false, reason: 'no_door_found' };

  const result = await walkThroughDoor(bot, door, goalVec);
  if (result.success) return { success: true, door: door.position };
  return result;
}

module.exports = {
  isNormalDoor,
  isLowerDoorHalf,
  isDoorOpen,
  getLowerDoorBlock,
  ensureDoorOpen,
  ensureDoorClosed,
  findNearbyDoors,
  chooseBestDoor,
  walkThroughDoor,
  tryDoorRetry
};