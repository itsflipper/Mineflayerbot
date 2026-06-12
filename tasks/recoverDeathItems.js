const { botState } = require('../state/botState');
const { wait, waitTicks } = require('../utils/timing');
const { toVec3, toBlockPosition } = require('../utils/position');
const { goalNear, goalBlock, safeGoto, getDroppedItemsNear } = require('../actions/navigation');
const { STATUS } = require('./taskRunner');

const RECOVERY_RADIUS = 10;
const MAX_ITEM_COLLECTION_LOOPS = 100;
const ITEM_COLLECT_TIMEOUT_MS = 1400;

const SCOUT_OFFSETS = [
  { x: 0, z: 0 },
  { x: 2, z: 0 },
  { x: -2, z: 0 },
  { x: 0, z: 2 },
  { x: 0, z: -2 },
  { x: 3, z: 3 },
  { x: 3, z: -3 },
  { x: -3, z: 3 },
  { x: -3, z: -3 },
  { x: 5, z: 0 },
  { x: -5, z: 0 },
  { x: 0, z: 5 },
  { x: 0, z: -5 }
];

function getDistanceTo(bot, position) {
  return bot.entity.position.distanceTo(position);
}

function isWithinDistance(distance, maxDistance) {
  return distance <= maxDistance;
}

function createPathSuccessWithWarning(warning) {
  return {
    success: true,
    closeEnough: true,
    warning
  };
}

async function safeGotoNear(bot, position, range = 1, label = 'goto_near') {
  const result = await safeGoto(bot, goalNear(position, range), label);

  if (result.success) return result;

  const distance = getDistanceTo(bot, position);

  if (isWithinDistance(distance, range + 0.75)) {
    return createPathSuccessWithWarning(result.error);
  }

  return { ...result, distance };
}

async function safeGotoBlock(bot, position, label = 'goto_block') {
  const target = toBlockPosition(position);
  const result = await safeGoto(bot, goalBlock(position), label);

  if (result.success) return result;

  const distance = getDistanceTo(bot, position);

  if (isWithinDistance(distance, 1.2)) {
    return createPathSuccessWithWarning(result.error);
  }

  return { ...result, distance, target };
}

function compareDistanceFromBot(bot) {
  return (entityA, entityB) => {
    const distanceA = getDistanceTo(bot, entityA.position);
    const distanceB = getDistanceTo(bot, entityB.position);
    return distanceA - distanceB;
  };
}

function getDroppedItemsInRadius(bot, centerPosition, radius) {
  return getDroppedItemsNear(bot, centerPosition, radius)
    .sort(compareDistanceFromBot(bot));
}

async function waitForItemsVisible(bot, deathPosition, radius, timeoutMs = 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const items = getDroppedItemsInRadius(bot, deathPosition, radius);

    if (items.length > 0) return items;

    await wait(100);
  }

  return getDroppedItemsInRadius(bot, deathPosition, radius);
}

function createItemsFoundResult(items) {
  return {
    success: true,
    itemsFound: items.length
  };
}

function createNoItemsFoundResult() {
  return {
    success: true,
    itemsFound: 0,
    reason: 'no_items_visible_after_scout'
  };
}

async function scanScoutPosition(bot, deathPosition, offset) {
  const scoutPosition = deathPosition.offset(offset.x, 0, offset.z);
  const gotoResult = await safeGotoNear(bot, scoutPosition, 1, 'scout_death_area');

  if (!gotoResult.success) return [];

  await waitTicks(bot, 3);

  return getDroppedItemsInRadius(bot, deathPosition, RECOVERY_RADIUS);
}

async function scanAroundDeathPosition(bot, deathPosition) {
  const visibleItems = await waitForItemsVisible(bot, deathPosition, RECOVERY_RADIUS, 900);

  if (visibleItems.length > 0) return createItemsFoundResult(visibleItems);

  for (const offset of SCOUT_OFFSETS) {
    const scoutItems = await scanScoutPosition(bot, deathPosition, offset);

    if (scoutItems.length > 0) return createItemsFoundResult(scoutItems);
  }

  return createNoItemsFoundResult();
}

function isSameEntity(entity, targetEntity) {
  return entity && targetEntity && entity.id === targetEntity.id;
}

function didBotCollectItem(bot, collector, collected, itemEntity) {
  return isSameEntity(collector, bot.entity) && isSameEntity(collected, itemEntity);
}

function createCollectTimeoutResult(bot, itemEntity, current) {
  return {
    success: false,
    reason: 'collect_timeout',
    entityId: itemEntity.id,
    distance: getDistanceTo(bot, current.position)
  };
}

function waitForCollectOrGone(bot, itemEntity, timeoutMs = ITEM_COLLECT_TIMEOUT_MS) {
  return new Promise(resolve => {
    let done = false;

    const cleanup = () => {
      bot.removeListener('playerCollect', onPlayerCollect);
      bot.removeListener('entityGone', onEntityGone);
    };

    const finish = result => {
      if (done) return;

      done = true;
      cleanup();
      resolve(result);
    };

    const onPlayerCollect = (collector, collected) => {
      if (!didBotCollectItem(bot, collector, collected, itemEntity)) return;

      finish({ success: true, reason: 'player_collect_event' });
    };

    const onEntityGone = entity => {
      if (!isSameEntity(entity, itemEntity)) return;

      finish({ success: true, reason: 'entity_gone_event' });
    };

    bot.on('playerCollect', onPlayerCollect);
    bot.on('entityGone', onEntityGone);

    setTimeout(() => {
      const current = bot.entities[itemEntity.id];

      if (!current) {
        finish({ success: true, reason: 'entity_missing_after_timeout' });
        return;
      }

      finish(createCollectTimeoutResult(bot, itemEntity, current));
    }, timeoutMs);
  });
}

async function nudgeIntoItem(bot, itemPosition) {
  await bot.lookAt(itemPosition.offset(0, 0.2, 0), true);

  bot.setControlState('sprint', false);
  bot.setControlState('forward', true);
  await wait(250);
  bot.setControlState('forward', false);

  await waitTicks(bot, 1);
}

function getCurrentItemEntity(bot, itemEntity) {
  const current = bot.entities[itemEntity.id];

  if (!current || !current.position) return null;

  return current;
}

async function moveToItem(bot, itemEntity) {
  const blockResult = await safeGotoBlock(bot, itemEntity.position, 'goto_item_block');

  if (blockResult.success) return blockResult;

  return safeGotoNear(bot, itemEntity.position, 0.4, 'goto_item_near');
}

async function tryCollectItem(bot, itemEntity, timeoutMs) {
  return waitForCollectOrGone(bot, itemEntity, timeoutMs);
}

async function tryCollectItemAfterNudge(bot, itemEntity) {
  const refreshed = getCurrentItemEntity(bot, itemEntity);

  if (!refreshed) return { success: true, reason: 'gone_before_nudge' };

  await nudgeIntoItem(bot, refreshed.position);

  const result = await tryCollectItem(bot, refreshed, 600);

  if (!result.success) return result;

  return {
    ...result,
    nudged: true
  };
}

async function collectOneDroppedItem(bot, itemEntity) {
  const current = getCurrentItemEntity(bot, itemEntity);

  if (!current) return { success: true, reason: 'item_already_gone' };

  const moveResult = await moveToItem(bot, current);

  if (!moveResult.success) return moveResult;

  await waitTicks(bot, 1);

  const collectResult = await tryCollectItem(bot, current, 450);

  if (collectResult.success) return collectResult;

  return tryCollectItemAfterNudge(bot, itemEntity);
}

async function waitForStableNoItems(bot, deathPosition, radius, stableMs = 300) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < stableMs) {
    const items = getDroppedItemsInRadius(bot, deathPosition, radius);

    if (items.length > 0) return false;

    await wait(100);
  }

  return getDroppedItemsInRadius(bot, deathPosition, radius).length === 0;
}

function createCollectionSuccess(loop, errors) {
  return {
    success: true,
    collectedLoops: loop - 1,
    errors
  };
}

function getFailCount(failedItemCounts, itemId) {
  return failedItemCounts.get(itemId) || 0;
}

function selectNextItem(nearbyItems, failedItemCounts) {
  return nearbyItems.find(item => getFailCount(failedItemCounts, item.id) < 3) || nearbyItems[0];
}

function recordFailedItem(errors, failedItemCounts, item, result, loop) {
  const failCount = getFailCount(failedItemCounts, item.id) + 1;

  failedItemCounts.set(item.id, failCount);

  errors.push({
    ...result,
    loop,
    itemId: item.id,
    failCount
  });
}

function recordSuccessfulItem(failedItemCounts, item) {
  failedItemCounts.delete(item.id);
}

async function collectNearbyItem(bot, deathPosition, failedItemCounts, errors, loop) {
  const nearbyItems = getDroppedItemsInRadius(bot, deathPosition, RECOVERY_RADIUS);

  if (nearbyItems.length === 0) return { hadItems: false };

  const nextItem = selectNextItem(nearbyItems, failedItemCounts);
  const result = await collectOneDroppedItem(bot, nextItem);

  if (result.success) {
    recordSuccessfulItem(failedItemCounts, nextItem);
    return { hadItems: true };
  }

  recordFailedItem(errors, failedItemCounts, nextItem, result, loop);
  await waitTicks(bot, 2);

  return { hadItems: true };
}

async function shouldFinishBecauseNoItems(bot, deathPosition) {
  return waitForStableNoItems(bot, deathPosition, RECOVERY_RADIUS, 300);
}

function createCollectionResult(bot, deathPosition, errors) {
  const remainingItems = getDroppedItemsInRadius(bot, deathPosition, RECOVERY_RADIUS);
  const success = remainingItems.length === 0;

  return {
    success,
    reason: success ? null : 'items_remaining_after_max_loops',
    remainingItems: remainingItems.length,
    errors
  };
}

async function collectAllDroppedItemsAroundDeath(bot, deathPosition) {
  const errors = [];
  const failedItemCounts = new Map();

  for (let loop = 1; loop <= MAX_ITEM_COLLECTION_LOOPS; loop++) {
    const collectResult = await collectNearbyItem(bot, deathPosition, failedItemCounts, errors, loop);

    if (!collectResult.hadItems && await shouldFinishBecauseNoItems(bot, deathPosition)) {
      return createCollectionSuccess(loop, errors);
    }

    if (!collectResult.hadItems) continue;

    await waitTicks(bot, 1);
  }

  return createCollectionResult(bot, deathPosition, errors);
}

function clearDeathPosition() {
  botState.lastDeathPosition = null;
}

function hasNoItemsFound(scanResult) {
  return scanResult.itemsFound === 0;
}

async function run(bot) {
  const deathPositionRaw = botState.lastDeathPosition;

  if (!deathPositionRaw) return STATUS.FAILURE;

  const deathPosition = toVec3(deathPositionRaw);
  const gotoDeathResult = await safeGotoNear(bot, deathPosition, 1, 'goto_death_position');

  if (!gotoDeathResult.success) return STATUS.FAILURE;

  await waitTicks(bot, 4);

  const scanResult = await scanAroundDeathPosition(bot, deathPosition);

  if (hasNoItemsFound(scanResult)) {
    clearDeathPosition();
    return STATUS.SUCCESS;
  }

  const collectResult = await collectAllDroppedItemsAroundDeath(bot, deathPosition);

  if (!collectResult.success) return STATUS.FAILURE;

  clearDeathPosition();

  return STATUS.SUCCESS;
}

module.exports = { run };