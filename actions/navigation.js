const { goals } = require('mineflayer-pathfinder');
const { waitTicks } = require('../utils/timing');
const { toBlockPosition } = require('../utils/position');
const { installPathing, pathfinderGoto, pathfinderSetGoal, pathfinderStop } = require('../utils/pathing/index');

async function stopPathfinder(bot, ticks = 2) {
  pathfinderStop(bot);

  if (typeof bot.clearControlStates === 'function') {
    bot.clearControlStates();
  }

  await waitTicks(bot, ticks);
}

function goalNear(position, range) {
  return new goals.GoalNear(position.x, position.y, position.z, range);
}

function goalBlock(position) {
  const target = toBlockPosition(position);
  return new goals.GoalBlock(target.x, target.y, target.z);
}

function goalFollow(entity, range) {
  return new goals.GoalFollow(entity, range);
}

function createPathFailure(label, error) {
  return {
    success: false,
    reason: 'path_failed',
    label,
    error: error.message
  };
}

async function safeGoto(bot, goal, label) {
  try {
    await pathfinderGoto(bot, goal);
    return { success: true };
  } catch (error) {
    await stopPathfinder(bot);
    return createPathFailure(label, error);
  }
}

async function gotoNearPosition(bot, position, range, label = 'goto_near') {
  return safeGoto(bot, goalNear(position, range), label);
}

async function gotoNearBlock(bot, block, range = 3, label) {
  return gotoNearPosition(bot, block.position, range, label || `goto_${block.name}`);
}

function isDroppedItemEntity(entity) {
  return entity && entity.name === 'item' && entity.position;
}

function getDroppedItemsNear(bot, position, maxDistance) {
  return Object.values(bot.entities)
    .filter(isDroppedItemEntity)
    .filter(entity => entity.position.distanceTo(position) <= maxDistance);
}

function findDroppedItemNear(bot, position, maxDistance) {
  return getDroppedItemsNear(bot, position, maxDistance)[0] || null;
}

function followEntity(bot, entity, range) {
  pathfinderSetGoal(bot, goalFollow(entity, range), true);
}

module.exports = {
  installPathing,
  stopPathfinder,
  goalNear,
  goalBlock,
  goalFollow,
  safeGoto,
  gotoNearPosition,
  gotoNearBlock,
  isDroppedItemEntity,
  getDroppedItemsNear,
  findDroppedItemNear,
  followEntity
};