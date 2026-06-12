const { Vec3 } = require('vec3');
const config = require('../config');
const { canPlace } = require('../safety/baseProtector');

const FACE_UP = new Vec3(0, 1, 0);

// Wichtig: KEIN { x: 0, z: 0 }, weil das der eigene Fußblock des Bots wäre.
const FLOOR_OFFSETS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
  { x: 1, z: 1 },
  { x: 1, z: -1 },
  { x: -1, z: 1 },
  { x: -1, z: -1 },
  { x: 2, z: 0 },
  { x: -2, z: 0 },
  { x: 0, z: 2 },
  { x: 0, z: -2 }
];

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitTicks(bot, ticks) {
  if (typeof bot.waitForTicks === 'function') {
    await bot.waitForTicks(ticks);
    return;
  }
  await wait(ticks * 50);
}

function isSolid(block) {
  return block && block.boundingBox === 'block';
}

function isEmptyForPlacement(block) {
  if (!block) return false;
  if (block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') return true;
  return block.boundingBox === 'empty' && !block.name.includes('water') && !block.name.includes('lava');
}

function sameBlockPosition(a, b) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function isInsideBotBody(bot, targetPosition) {
  const feet = bot.entity.position.floored();
  const head = feet.offset(0, 1, 0);
  return sameBlockPosition(targetPosition, feet) || sameBlockPosition(targetPosition, head);
}

function blockMatchesItem(block, item) {
  return block && item && block.name === item.name;
}

function collectPlacementSpots(bot) {
  const feetPosition = bot.entity.position.floored();
  const spots = [];

  for (const offset of FLOOR_OFFSETS) {
    const floorPosition = feetPosition.offset(offset.x, -1, offset.z);
    const floorBlock = bot.blockAt(floorPosition);
    if (!isSolid(floorBlock)) continue;

    const targetPosition = floorPosition.offset(0, 1, 0);
    if (isInsideBotBody(bot, targetPosition)) continue;

    const targetBlock = bot.blockAt(targetPosition);
    if (!isEmptyForPlacement(targetBlock)) continue;

    if (!canPlace(config.worldId, targetPosition)) continue;

    spots.push({ referenceBlock: floorBlock, targetPosition });
  }

  return spots;
}

async function prepareForPlacement(bot, targetPosition) {
  if (bot.pathfinder) bot.pathfinder.setGoal(null);
  if (typeof bot.clearControlStates === 'function') bot.clearControlStates();

  await waitTicks(bot, 2);

  await bot.lookAt(targetPosition.offset(0.5, 0.5, 0.5), true);

  await waitTicks(bot, 1);
}

async function tryPlaceAtSpot(bot, item, spot) {
  const beforeTarget = bot.blockAt(spot.targetPosition);

  if (!isEmptyForPlacement(beforeTarget)) {
    if (blockMatchesItem(beforeTarget, item)) {
      return { success: true, alreadyPlaced: true };
    }

    return { success: false, reason: 'target_not_empty' };
  }

  await prepareForPlacement(bot, spot.targetPosition);
  await bot.equip(item, 'hand');

  try {
    await bot.placeBlock(spot.referenceBlock, FACE_UP);
  } catch (err) {
    // Falls Mineflayer auf blockUpdate wartet, aber der Serverzustand trotzdem schon passt.
    await waitTicks(bot, 4);

    const afterTimeoutBlock = bot.blockAt(spot.targetPosition);
    if (blockMatchesItem(afterTimeoutBlock, item)) {
      return { success: true, recoveredFromTimeout: true };
    }

    return {
      success: false,
      reason: 'place_failed',
      error: err.message
    };
  }

  await waitTicks(bot, 2);

  const placedBlock = bot.blockAt(spot.targetPosition);
  if (blockMatchesItem(placedBlock, item)) {
    return { success: true };
  }

  return {
    success: false,
    reason: 'not_confirmed',
    found: placedBlock ? placedBlock.name : 'unknown'
  };
}

async function placeBlockNearby(bot, item) {
  if (!item) return { success: false, reason: 'missing_item' };

  const spots = collectPlacementSpots(bot);
  if (spots.length === 0) {
    return { success: false, reason: 'no_valid_spot' };
  }

  const errors = [];

  for (const spot of spots) {
    const result = await tryPlaceAtSpot(bot, item, spot);

    if (result.success) {
      return {
        ...result,
        position: {
          x: spot.targetPosition.x,
          y: spot.targetPosition.y,
          z: spot.targetPosition.z
        }
      };
    }

    errors.push({
      position: spot.targetPosition,
      reason: result.reason,
      error: result.error,
      found: result.found
    });
  }

  return {
    success: false,
    reason: 'all_spots_failed',
    errors
  };
}

module.exports = { placeBlockNearby };