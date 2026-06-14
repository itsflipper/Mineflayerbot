const config = require('../config');
const { canDig } = require('../safety/baseProtector');
const { waitTicks } = require('../utils/timing');
const { gotoNearPosition, stopPathfinder } = require('./navigation');

// ---------------------------------------------------------------------
// Gemeinsame Helfer
// ---------------------------------------------------------------------

function isDiggableAir(block) {
  if (!block) return false;
  return block.boundingBox === 'empty' || block.name === 'air' || block.name === 'cave_air';
}

function isProtected(position) {
  return !canDig(config.worldId, position);
}

async function digBlockAt(bot, position) {
  const block = bot.blockAt(position);

  if (isDiggableAir(block)) return { success: true, skipped: true };
  if (isProtected(position)) return { success: false, reason: 'protected', position };

  try {
    await bot.lookAt(position.offset(0.5, 0.5, 0.5), true);
    await waitTicks(bot, 1);
    await bot.dig(block);
    return { success: true };
  } catch (err) {
    return { success: false, reason: 'dig_failed', error: err.message, position };
  }
}

// ---------------------------------------------------------------------
// Treppe nach unten
// ---------------------------------------------------------------------

function getFacingOffset(bot) {
  const yaw = bot.entity.yaw;

  const directions = [
    { x: 0, z: 1 },   // Süd
    { x: -1, z: 0 },  // West
    { x: 0, z: -1 },  // Nord
    { x: 1, z: 0 }    // Ost
  ];

  const index = Math.round(((yaw % (2 * Math.PI)) + 2 * Math.PI) / (Math.PI / 2)) % 4;
  return directions[index];
}

function getStaircaseStepPositions(bot, includeHeadClearance = true) {
  const offset = getFacingOffset(bot);
  const feet = bot.entity.position.floored();
  const stepFeet = feet.offset(offset.x, -1, offset.z);

  const toDig = [
    stepFeet,
    stepFeet.offset(0, 1, 0)
  ];

  if (includeHeadClearance) {
    toDig.push(stepFeet.offset(0, 2, 0));
  }

  return { stepFeet, toDig };
}

async function moveOntoStep(bot, stepFeet) {
  const target = stepFeet.offset(0.5, 1, 0.5);
  await bot.lookAt(target, true);

  bot.setControlState('forward', true);
  await waitTicks(bot, 6);
  bot.setControlState('forward', false);
  await waitTicks(bot, 2);
}

function isStoneBlock(block, stoneNames) {
  return block && stoneNames.includes(block.name);
}

async function digStaircaseStep(bot, stoneNames, isLastStep) {
  const { stepFeet, toDig } = getStaircaseStepPositions(bot, !isLastStep);

  for (const position of toDig) {
    const digResult = await digBlockAt(bot, position);

    if (!digResult.success) {
      return { reachedStone: false, blocked: true, reason: digResult.reason, error: digResult.error };
    }
  }

  await moveOntoStep(bot, stepFeet);

  const belowStep = bot.blockAt(stepFeet.offset(0, -1, 0));
  return { reachedStone: isStoneBlock(belowStep, stoneNames), stepFeet };
}

async function digStaircaseDown(bot, stoneNames, maxDepth, extraStepsAfterStone = 2) {
  await stopPathfinder(bot, 0);

  const path = [];
  let extraRemaining = null;

  for (let step = 1; step <= maxDepth; step++) {
    const isLastStep = step === maxDepth || extraRemaining === 0;
    const stepResult = await digStaircaseStep(bot, stoneNames, isLastStep);

    if (stepResult.blocked) {
      return { dug: step > 1, reason: stepResult.reason, error: stepResult.error, steps: step - 1, path };
    }

    path.push(stepResult.stepFeet);

    if (stepResult.reachedStone && extraRemaining === null) {
      extraRemaining = extraStepsAfterStone;
    }

    if (extraRemaining !== null) {
      if (extraRemaining === 0) {
        return { dug: true, reason: 'reached_stone', steps: step, path };
      }
      extraRemaining--;
    }
  }

  return { dug: true, reason: 'max_depth_reached', steps: maxDepth, path };
}

async function climbStaircaseUp(bot, path) {
  await stopPathfinder(bot, 0);

  for (let i = path.length - 2; i >= 0; i--) {
    const stepFeet = path[i];

    await bot.lookAt(stepFeet.offset(0.5, 1, 0.5), true);
    bot.setControlState('forward', true);
    bot.setControlState('jump', true);
    await waitTicks(bot, 5);
    bot.setControlState('forward', false);
    bot.setControlState('jump', false);
    await waitTicks(bot, 1);
  }

  return { climbed: Math.max(0, path.length - 1) };
}

// ---------------------------------------------------------------------
// 3x3x3 Kasten vor dem Bot
// ---------------------------------------------------------------------

function getSidewaysOffset(facing) {
  return { x: -facing.z, z: facing.x };
}

function getDigBoxPositions(bot) {
  const facing = getFacingOffset(bot);
  const sideways = getSidewaysOffset(facing);
  const feet = bot.entity.position.floored();
  const front = feet.offset(facing.x, 0, facing.z);

  const positions = [];

  for (let depth = 0; depth < 3; depth++) {
    for (let height = -1; height <= 1; height++) {
      for (let side = -1; side <= 1; side++) {
        positions.push(
          front
            .offset(facing.x * depth, height, facing.z * depth)
            .offset(sideways.x * side, 0, sideways.z * side)
        );
      }
    }
  }

  return positions;
}

async function collectDropsInBox(bot) {
  const facing = getFacingOffset(bot);
  const feet = bot.entity.position.floored();
  const center = feet.offset(facing.x * 2, 0, facing.z * 2);

  await gotoNearPosition(bot, center, 0, 'goto_dig_box_center');
  await waitTicks(bot, 6);
}

async function digBoxInFront(bot) {
  const positions = getDigBoxPositions(bot);
  const errors = [];

  for (const position of positions) {
    const digResult = await digBlockAt(bot, position);

    if (!digResult.success) {
      errors.push(digResult);
    }
  }

  await collectDropsInBox(bot);

  return { success: errors.length === 0, errors };
}

module.exports = {
  digBlockAt,
  digStaircaseDown,
  climbStaircaseUp,
  digBoxInFront,
  getFacingOffset
};