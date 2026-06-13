const config = require('../../config');
const { canDig } = require('../../safety/baseProtector');
const { wait, waitTicks } = require('../../utils/timing');
const { gotoNearPosition, getDroppedItemsNear } = require('../navigation');
const { digStaircaseDown, climbStaircaseUp, digBoxInFront } = require('../digging');
const { STONE_NAMES, COBBLESTONE_NAMES, countCobblestone } = require('../../data/items/stoneTypes');

const STAIRCASE_MAX_DEPTH = 7;
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
// unter dem Meeresspiegel steht (digStaircaseDown). Unten angekommen wird
// zusätzlich ein 3x3x3 Kasten vor ihm freigegraben (digBoxInFront), damit
// genug Stone/Deepslate für mehrere Abbauversuche erreichbar ist.

function isFarBelowSeaLevel(bot) {
  const currentY = bot.entity.position.y;
  return currentY <= SEA_LEVEL_Y - STAIRCASE_MAX_DEPTH;
}

async function descendToStone(bot) {
  if (isFarBelowSeaLevel(bot)) {
    return { descended: false, reason: 'already_below_threshold' };
  }

  if (!hasEquippablePickaxe(bot)) {
    return { descended: false, reason: 'no_pickaxe' };
  }

  await ensurePickaxeEquipped(bot);

  const staircaseResult = await digStaircaseDown(bot, STONE_NAMES, STAIRCASE_MAX_DEPTH);
  const boxResult = await digBoxInFront(bot);

  return { descended: true, staircaseResult, boxResult };
}

// Läuft, falls eine Treppe gegraben wurde, am Ende wieder hoch zur
// Ausgangsposition - sonst müsste der Bot sich später (z.B. für den
// Crafting Table) mit einem Dirt-Turm nach oben graben.
async function climbBackUp(bot, staircasePath) {
  if (staircasePath.length === 0) return { climbed: 0 };

  return climbStaircaseUp(bot, staircasePath);
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
      cobblestoneCount: countCobblestone(bot)
    };
  }

  // Task-Voraussetzung, kein Collect-Fehler im engeren Sinn: ohne Pickaxe
  // droppt Stone kein Cobblestone. Die Task entscheidet, was in diesem
  // Fall zu tun ist (siehe stoneTools.js).
  if (!hasEquippablePickaxe(bot)) {
    return {
      success: false,
      reason: 'no_pickaxe',
      cobblestoneCount: countCobblestone(bot)
    };
  }

  // Treppe + Kasten laufen IMMER (außer der Bot ist schon tief genug) -
  // ein "ist überhaupt Stein in 32 Blöcken sichtbar"-Check würde fast immer
  // true sein (Stein liegt fast überall darunter) und damit das Graben nie
  // auslösen, obwohl der Bot an der Oberfläche steht.
  const descendResult = await descendToStone(bot);
  const staircasePath = descendResult.staircaseResult?.path || [];

  const errors = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const outcome = await tryCollectOneStone(bot, minCobblestoneCount, maxDistance, errors);

    if (outcome.done) {
      await climbBackUp(bot, staircasePath);
      return { ...outcome.result, cobblestoneCount: countCobblestone(bot), errors };
    }
  }

  await climbBackUp(bot, staircasePath);

  return {
    success: false,
    reason: 'collect_failed',
    cobblestoneCount: countCobblestone(bot),
    errors
  };
}

module.exports = { collectNearbyStone };