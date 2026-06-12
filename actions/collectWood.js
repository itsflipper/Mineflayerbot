const config = require('../config');
const { canDig } = require('../safety/baseProtector');
const { wait, waitTicks } = require('../utils/timing');
const { gotoNearPosition, findDroppedItemNear } = require('./navigation');
const { LOG_NAMES, countLogs } = require('./woodTypes');

function hasTargetLogCount(bot, minLogCount) {
  return countLogs(bot) >= minLogCount;
}

async function waitForLogCount(bot, minLogCount, timeoutMs = 2000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (hasTargetLogCount(bot, minLogCount)) return true;
    await wait(100);
  }

  return hasTargetLogCount(bot, minLogCount);
}

function findNearestDiggableLog(bot, maxDistance = 32) {
  const candidates = bot.findBlocks({
    matching: (block) => LOG_NAMES.includes(block.name),
    maxDistance,
    count: 30
  });

  if (candidates.length === 0) {
    return { block: null, reason: 'no_log_found' };
  }

  for (const position of candidates) {
    const block = bot.blockAt(position);
    if (!block || !LOG_NAMES.includes(block.name)) continue;

    if (canDig(config.worldId, position)) {
      return { block, reason: null };
    }
  }

  return { block: null, reason: 'all_logs_protected' };
}

async function collectDroppedItemNearby(bot, minLogCount) {
  const droppedItem = findDroppedItemNear(bot, bot.entity.position, 8);
  if (!droppedItem) return false;

  const gotoResult = await gotoNearPosition(bot, droppedItem.position, 1, 'goto_dropped_log');

  if (!gotoResult.success) {
    if (hasTargetLogCount(bot, minLogCount)) {
      return true;
    }

    return false;
  }

  return await waitForLogCount(bot, minLogCount, 2000);
}

async function equipAxeIfAvailable(bot) {
  const axe = bot.inventory.items().find(item => item.name.endsWith('_axe'));
  if (axe) {
    await bot.equip(axe, 'hand');
  }
}

async function gotoNearBlock(bot, block, minLogCount) {
  const gotoResult = await gotoNearPosition(bot, block.position, 3, `goto_${block.name}`);

  if (gotoResult.success) return gotoResult;

  if (hasTargetLogCount(bot, minLogCount)) {
    return {
      success: true,
      recovered: true,
      warning: gotoResult.error
    };
  }

  const distance = bot.entity.position.distanceTo(block.position);
  if (distance <= 5) {
    return {
      success: true,
      closeEnough: true,
      warning: gotoResult.error
    };
  }

  return gotoResult;
}

async function digLog(bot, logBlock, minLogCount) {
  const freshBlock = bot.blockAt(logBlock.position);

  if (!freshBlock || !LOG_NAMES.includes(freshBlock.name)) {
    if (hasTargetLogCount(bot, minLogCount)) {
      return { success: true, recovered: true };
    }

    return { success: false, reason: 'log_disappeared' };
  }

  if (!canDig(config.worldId, freshBlock.position)) {
    return { success: false, reason: 'log_protected' };
  }

  try {
    await bot.lookAt(freshBlock.position.offset(0.5, 0.5, 0.5), true);
    await waitTicks(bot, 1);
    await bot.dig(freshBlock);
  } catch (err) {
    if (await waitForLogCount(bot, minLogCount, 1000)) {
      return {
        success: true,
        recovered: true,
        warning: err.message
      };
    }

    return {
      success: false,
      reason: 'dig_failed',
      error: err.message
    };
  }

  if (await waitForLogCount(bot, minLogCount, 600)) {
    return { success: true };
  }

  await collectDroppedItemNearby(bot, minLogCount);

  if (await waitForLogCount(bot, minLogCount, 600)) {
    return { success: true };
  }

  return { success: false, reason: 'log_not_collected' };
}

async function collectNearbyLog(bot, options = {}) {
  const minLogCount = Math.max(1, Number(options.minLogCount || 1));
  const maxDistance = Math.max(4, Number(options.maxDistance || 32));
  const attempts = Math.max(1, Number(options.attempts || 3));

  if (hasTargetLogCount(bot, minLogCount)) {
    return {
      success: true,
      alreadyHadLogs: true,
      logCount: countLogs(bot)
    };
  }

  const errors = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { block: logBlock, reason } = findNearestDiggableLog(bot, maxDistance);

    if (!logBlock) {
      return {
        success: false,
        reason,
        logCount: countLogs(bot),
        errors
      };
    }

    await equipAxeIfAvailable(bot);

    const gotoResult = await gotoNearBlock(bot, logBlock, minLogCount);
    if (!gotoResult.success) {
      errors.push(gotoResult);

      if (hasTargetLogCount(bot, minLogCount)) {
        return {
          success: true,
          recovered: true,
          logCount: countLogs(bot),
          errors
        };
      }

      continue;
    }

    if (hasTargetLogCount(bot, minLogCount)) {
      return {
        success: true,
        recovered: Boolean(gotoResult.recovered),
        logCount: countLogs(bot),
        warning: gotoResult.warning || null
      };
    }

    const digResult = await digLog(bot, logBlock, minLogCount);
    if (digResult.success) {
      return {
        success: true,
        logCount: countLogs(bot),
        recovered: Boolean(digResult.recovered),
        warning: digResult.warning || gotoResult.warning || null
      };
    }

    errors.push(digResult);
    await waitTicks(bot, 1);
  }

  return {
    success: false,
    reason: 'collect_failed',
    logCount: countLogs(bot),
    errors
  };
}

module.exports = { collectNearbyLog };