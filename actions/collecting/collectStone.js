const config = require('../../config');
const { canDig } = require('../../safety/baseProtector');
const { wait, waitTicks } = require('../../utils/timing');
const { gotoNearPosition, getDroppedItemsNear } = require('../navigation');
const { digBlockAt, digStaircaseDown, climbStaircaseUp, digBoxInFront } = require('../digging');
const { STONE_NAMES, COBBLESTONE_NAMES, countCobblestone } = require('../../data/items/stoneTypes');

const STAIRCASE_MAX_DEPTH = 10;
const SEA_LEVEL_Y = 63;

function getDroppedItemName(entity) {
  const item = entity.getDroppedItem?.();
  if (item) return item.name;

  const metaItem = entity.metadata?.[8];
  if (metaItem?.itemId != null) return metaItem.itemId;

  return null;
}

function isDroppedCobblestone(entity) {
  return COBBLESTONE_NAMES.includes(getDroppedItemName(entity));
}

function findDroppedCobblestoneNear(bot, position, maxDistance) {
  return getDroppedItemsNear(bot, position, maxDistance).find(isDroppedCobblestone) || null;
}

function hasTargetCobblestoneCount(bot, minCobblestoneCount) {
  return countCobblestone(bot) >= minCobblestoneCount;
}

async function waitForCobblestoneCount(bot, minCobblestoneCount, timeoutMs = 2000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (hasTargetCobblestoneCount(bot, minCobblestoneCount)) return true;
    await wait(100);
  }

  return hasTargetCobblestoneCount(bot, minCobblestoneCount);
}

function findNearestDiggableStone(bot, maxDistance = 32, stoneNames = STONE_NAMES) {
  const candidates = bot.findBlocks({
    matching: (block) => stoneNames.includes(block.name),
    maxDistance,
    count: 30
  });

  if (candidates.length === 0) {
    return { block: null, reason: 'no_stone_found' };
  }

  for (const position of candidates) {
    const block = bot.blockAt(position);
    if (!block || !stoneNames.includes(block.name)) continue;

    if (canDig(config.worldId, position)) {
      return { block, reason: null };
    }
  }

  return { block: null, reason: 'all_stone_protected' };
}

async function collectDroppedItemNearby(bot, minCobblestoneCount) {
  const droppedItem = findDroppedCobblestoneNear(bot, bot.entity.position, 8);
  if (!droppedItem) return false;

  const gotoResult = await gotoNearPosition(bot, droppedItem.position, 1, 'goto_dropped_cobblestone');

  if (!gotoResult.success) {
    return hasTargetCobblestoneCount(bot, minCobblestoneCount);
  }

  return await waitForCobblestoneCount(bot, minCobblestoneCount, 2000);
}

function findEquippablePickaxe(bot) {
  return bot.inventory.items().find(item => item.name.endsWith('_pickaxe')) || null;
}

function hasEquippablePickaxe(bot) {
  return Boolean(findEquippablePickaxe(bot));
}

// Stellt sicher, dass die Pickaxe in der Hand ist - wird vor JEDEM Abbauversuch
// aufgerufen (nicht nur "wenn vorhanden"), damit der Bot nicht mit der bloßen
// Hand abbaut und dadurch keinen Cobblestone-Drop bekommt.
async function ensurePickaxeEquipped(bot) {
  const pickaxe = findEquippablePickaxe(bot);
  if (!pickaxe) return false;

  const heldItem = bot.heldItem;
  if (heldItem && heldItem.name === pickaxe.name) return true;

  await bot.equip(pickaxe, 'hand');
  return true;
}

async function gotoNearBlock(bot, block, minCobblestoneCount) {
  const gotoResult = await gotoNearPosition(bot, block.position, 3, `goto_${block.name}`);

  if (gotoResult.success) return gotoResult;

  if (hasTargetCobblestoneCount(bot, minCobblestoneCount)) {
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

// ---------------------------------------------------------------------
// Abstieg: Treppe + Kasten (siehe actions/digging.js)
// ---------------------------------------------------------------------
//
// Treppe + Kasten laufen IMMER, sobald der Bot nicht bereits weit genug
// unter dem Meeresspiegel steht (digStaircaseDown). Die Treppe gräbt
// 2 zusätzliche Stufen, nachdem sie zum ersten Mal auf Stone trifft
// (extraStepsAfterStone in digStaircaseDown), damit unten genug Platz/
// Stein für den Kasten ist. Danach wird zusätzlich ein 3x3x3 Kasten vor
// ihm freigegraben (digBoxInFront), damit genug Stone/Deepslate für
// mehrere Abbauversuche erreichbar ist.
//
// digBoxInFront läuft intern zum Zentrum des Kastens (collectDropsInBox),
// wodurch der Bot die Treppenlinie verlässt. Damit climbStaircaseUp danach
// wieder an der richtigen Stelle ansetzen kann, läuft der Bot nach dem
// Kasten-Graben zurück zur untersten Treppenstufe.

function isFarBelowSeaLevel(bot) {
  const currentY = bot.entity.position.y;
  return currentY <= SEA_LEVEL_Y - STAIRCASE_MAX_DEPTH;
}

function isBackAtSurface(bot, startPosition) {
  return bot.entity.position.y >= startPosition.y;
}

async function descendToStone(bot) {
  const startPosition = bot.entity.position.clone();

  if (isFarBelowSeaLevel(bot)) {
    return { descended: false, reason: 'already_below_threshold', startPosition };
  }

  if (!hasEquippablePickaxe(bot)) {
    return { descended: false, reason: 'no_pickaxe', startPosition };
  }

  await ensurePickaxeEquipped(bot);

  const staircaseResult = await digStaircaseDown(bot, STONE_NAMES, STAIRCASE_MAX_DEPTH);
  const boxResult = await digBoxInFront(bot);

  const staircasePath = staircaseResult.path || [];
  if (staircasePath.length > 0) {
    const lastStep = staircasePath[staircasePath.length - 1];
    await gotoNearPosition(bot, lastStep, 0, 'goto_staircase_bottom');
  }

  return { descended: true, staircaseResult, boxResult, startPosition };
}
async function climbBackUp(bot, staircasePath, startPosition) {
  if (staircasePath.length === 0) {
    return { climbed: 0, atSurface: true };
  }

  if (bot.pathfinder) bot.pathfinder.setGoal(null);

  const climbResult = await climbStaircaseUp(bot, staircasePath);

  if (isBackAtSurface(bot, startPosition)) {
    return { ...climbResult, atSurface: true };
  }

  // Treppe war unvollständig oder hat nicht gereicht - direkt nach oben graben
  // und gleichzeitig vorwärts/springen, damit der Bot sicher nicht mehr im
  // Loch steht, bevor die Task weiterläuft.
  while (!isBackAtSurface(bot, startPosition)) {
    const above = bot.entity.position.floored().offset(0, 2, 0);
    const digResult = await digBlockAt(bot, above);

    if (!digResult.success) break;

    bot.setControlState('forward', true);
    bot.setControlState('jump', true);
    await waitTicks(bot, 5);
    bot.setControlState('forward', false);
    bot.setControlState('jump', false);
    await waitTicks(bot, 1);
  }

  return { ...climbResult, atSurface: isBackAtSurface(bot, startPosition) };
}

// ---------------------------------------------------------------------
// Abbauen
// ---------------------------------------------------------------------

// Cobblestone droppt nur, wenn der Block mit einer Pickaxe abgebaut wird.
// ensurePickaxeEquipped() wird hier direkt vor jedem Abbauversuch
// aufgerufen, damit der erste Abbau nicht versehentlich mit der bloßen
// Hand passiert.
async function digStone(bot, stoneBlock, minCobblestoneCount) {
  const freshBlock = bot.blockAt(stoneBlock.position);

  if (!freshBlock || !STONE_NAMES.includes(freshBlock.name)) {
    return hasTargetCobblestoneCount(bot, minCobblestoneCount)
      ? { success: true, recovered: true }
      : { success: false, reason: 'stone_disappeared' };
  }

  if (!canDig(config.worldId, freshBlock.position)) {
    return { success: false, reason: 'stone_protected' };
  }

  await ensurePickaxeEquipped(bot);

  try {
    await bot.lookAt(freshBlock.position.offset(0.5, 0.5, 0.5), true);
    await waitTicks(bot, 1);
    await bot.dig(freshBlock);
  } catch (err) {
    if (await waitForCobblestoneCount(bot, minCobblestoneCount, 1000)) {
      return { success: true, recovered: true, warning: err.message };
    }

    return { success: false, reason: 'dig_failed', error: err.message };
  }

  if (await waitForCobblestoneCount(bot, minCobblestoneCount, 600)) {
    return { success: true };
  }

  await collectDroppedItemNearby(bot, minCobblestoneCount);

  if (await waitForCobblestoneCount(bot, minCobblestoneCount, 600)) {
    return { success: true };
  }

  return { success: false, reason: 'cobblestone_not_collected' };
}

// ---------------------------------------------------------------------
// Eine Iteration: Stone finden, dorthin gehen, abbauen.
// Extrahiert aus der Hauptschleife (Inversion: früh zurückkehren statt
// verschachtelter if/else-Ketten).
// ---------------------------------------------------------------------

async function tryCollectOneStone(bot, minCobblestoneCount, maxDistance, errors) {
  const { block: stoneBlock, reason } = findNearestDiggableStone(bot, maxDistance);

  if (!stoneBlock) {
    return { done: true, result: { success: false, reason } };
  }

  await ensurePickaxeEquipped(bot);

  const gotoResult = await gotoNearBlock(bot, stoneBlock, minCobblestoneCount);

  if (!gotoResult.success) {
    errors.push(gotoResult);

    if (hasTargetCobblestoneCount(bot, minCobblestoneCount)) {
      return { done: true, result: { success: true, recovered: true } };
    }

    return { done: false };
  }

  if (hasTargetCobblestoneCount(bot, minCobblestoneCount)) {
    return {
      done: true,
      result: { success: true, recovered: Boolean(gotoResult.recovered), warning: gotoResult.warning || null }
    };
  }

  const digResult = await digStone(bot, stoneBlock, minCobblestoneCount);

  if (digResult.success) {
    return {
      done: true,
      result: {
        success: true,
        recovered: Boolean(digResult.recovered),
        warning: digResult.warning || gotoResult.warning || null
      }
    };
  }

  errors.push(digResult);
  await waitTicks(bot, 1);

  return { done: false };
}

async function collectNearbyStone(bot, options = {}) {
  const minCobblestoneCount = Math.max(1, Number(options.minCobblestoneCount || 1));
  const maxDistance = Math.max(4, Number(options.maxDistance || 32));
  const attempts = Math.max(1, Number(options.attempts || 3));

  if (hasTargetCobblestoneCount(bot, minCobblestoneCount)) {
    return {
      success: true,
      alreadyHadCobblestone: true,
      cobblestoneCount: countCobblestone(bot),
      atSurface: true
    };
  }

  if (!hasEquippablePickaxe(bot)) {
    return {
      success: false,
      reason: 'no_pickaxe',
      cobblestoneCount: countCobblestone(bot),
      atSurface: true
    };
  }

  const descendResult = await descendToStone(bot);
  const staircasePath = descendResult.staircaseResult?.path || [];
  const startPosition = descendResult.startPosition;

  const errors = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const outcome = await tryCollectOneStone(bot, minCobblestoneCount, maxDistance, errors);

    if (outcome.done) {
      const climbResult = await climbBackUp(bot, staircasePath, startPosition);
      return { ...outcome.result, cobblestoneCount: countCobblestone(bot), errors, atSurface: climbResult.atSurface };
    }
  }

  const climbResult = await climbBackUp(bot, staircasePath, startPosition);

  return {
    success: false,
    reason: 'collect_failed',
    cobblestoneCount: countCobblestone(bot),
    errors,
    atSurface: climbResult.atSurface
  };
}

module.exports = { collectNearbyStone };