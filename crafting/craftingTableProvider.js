const config = require('../config');
const { canDig } = require('../safety/baseProtector');
const { wait, waitTicks } = require('../utils/timing');
const { findItem, hasItem, countItem } = require('../utils/inventory');
const { gotoNearBlock, gotoNearPosition, findDroppedItemNear } = require('../actions/navigation');
const { placeBlockNearby } = require('../actions/placeBlock');

const CRAFTING_TABLE_SEARCH_DISTANCE = 6;
const PLACED_CRAFTING_TABLE_SEARCH_DISTANCE = 8;

const PREFERRED_AXES = [
  'netherite_axe',
  'diamond_axe',
  'iron_axe',
  'stone_axe',
  'wooden_axe',
  'golden_axe'
];

function findNearbyCraftingTable(bot, maxDistance = CRAFTING_TABLE_SEARCH_DISTANCE) {
  const positions = bot.findBlocks({
    matching: block => block.name === 'crafting_table',
    maxDistance,
    count: 10
  });

  for (const position of positions) {
    const block = bot.blockAt(position);
    if (block && block.name === 'crafting_table') return block;
  }

  return null;
}

function getFreshCraftingTable(bot, craftingTableBlock) {
  const tableBlock = bot.blockAt(craftingTableBlock.position);

  if (!tableBlock || tableBlock.name !== 'crafting_table') return null;

  return tableBlock;
}

async function useExistingCraftingTable(bot, craftingTableBlock) {
  const gotoResult = await gotoNearBlock(bot, craftingTableBlock, 3);

  if (!gotoResult.success) return gotoResult;

  return {
    success: true,
    block: bot.blockAt(craftingTableBlock.position),
    ownedByUs: false,
    source: 'existing_nearby'
  };
}

function createNoCraftingTableItemFailure() {
  return {
    success: false,
    reason: 'no_crafting_table_item_to_place'
  };
}

function createPlaceFailedResult(placeResult) {
  return {
    success: false,
    reason: 'crafting_table_place_failed',
    placeResult
  };
}

function createPlacedTableNotFoundFailure() {
  return {
    success: false,
    reason: 'placed_crafting_table_not_found'
  };
}

const PLACEMENT_RETRY_OFFSETS = [
  { x: 3, z: 0 },
  { x: -3, z: 0 },
  { x: 0, z: 3 },
  { x: 0, z: -3 }
];

async function repositionForPlacement(bot, offset) {
  const target = bot.entity.position.floored().offset(offset.x, 0, offset.z);
  await gotoNearPosition(bot, target, 1, 'reposition_for_table_placement');
}

async function placeCraftingTableFromInventory(bot, source) {
  const tableItem = findItem(bot, 'crafting_table');

  if (!tableItem) return createNoCraftingTableItemFailure();

  let placeResult = await placeBlockNearby(bot, tableItem);

  if (!placeResult.success) {
    for (const offset of PLACEMENT_RETRY_OFFSETS) {
      await repositionForPlacement(bot, offset);
      placeResult = await placeBlockNearby(bot, tableItem);
      if (placeResult.success) break;
    }
  }

  if (!placeResult.success) return createPlaceFailedResult(placeResult);

  await waitTicks(bot, 4);

  const placedTable = findNearbyCraftingTable(bot, PLACED_CRAFTING_TABLE_SEARCH_DISTANCE);

  if (!placedTable) return createPlacedTableNotFoundFailure();

  const gotoResult = await gotoNearBlock(bot, placedTable, 3);

  if (!gotoResult.success) return gotoResult;

  return {
    success: true,
    block: bot.blockAt(placedTable.position),
    ownedByUs: true,
    source
  };
}

// Sucht zuerst nach einem nahen Crafting Table und nutzt ihn, falls vorhanden.
// Sonst wird ein Crafting Table aus dem Inventar platziert.
// Falls auch im Inventar keiner vorhanden ist, schlägt dieser Aufruf fehl -
// in dem Fall muss vorher 'crafting_table' als zusätzliches Craft-Ziel im
// Plan eingeplant und gecraftet worden sein (siehe smartCraft.js).
//
// Ist ein gefundener Tisch nicht erreichbar (z.B. von einem früheren Lauf
// übrig geblieben und mittlerweile verschüttet/unzugänglich), wird das
// NICHT als Gesamtfehler gewertet - stattdessen wird, falls im Inventar
// vorhanden, ein neuer Tisch platziert.
async function ensureCraftingTableBlock(bot) {
  const existingTable = findNearbyCraftingTable(bot, CRAFTING_TABLE_SEARCH_DISTANCE);

  if (existingTable) {
    const existingResult = await useExistingCraftingTable(bot, existingTable);

    if (existingResult.success) return existingResult;
    if (!hasItem(bot, 'crafting_table')) return existingResult;
  }

  if (!hasItem(bot, 'crafting_table')) {
    return createNoCraftingTableItemFailure();
  }

  return placeCraftingTableFromInventory(bot, 'placed_from_inventory');
}

function findBestAxe(bot) {
  for (const itemName of PREFERRED_AXES) {
    const item = findItem(bot, itemName);
    if (item) return item;
  }

  return null;
}

async function equipBestAxe(bot) {
  const axe = findBestAxe(bot);

  if (!axe) return;

  await bot.equip(axe, 'hand');
}

async function waitForItemCount(bot, itemName, targetCount, timeoutMs = 4000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (countItem(bot, itemName) >= targetCount) return true;
    await wait(150);
  }

  return countItem(bot, itemName) >= targetCount;
}

async function collectDroppedTableNear(bot, position, targetCount) {
  const droppedItem = findDroppedItemNear(bot, position, 8);

  if (!droppedItem) return false;

  await gotoNearPosition(bot, droppedItem.position, 1, 'collect_crafting_table_drop');

  return waitForItemCount(bot, 'crafting_table', targetCount, 3000);
}

function createAlreadyMissingResult() {
  return {
    success: true,
    reason: 'crafting_table_already_missing'
  };
}

function createProtectedFailure(position) {
  return {
    success: false,
    reason: 'crafting_table_is_protected',
    position
  };
}

function createDigFailure(error) {
  return {
    success: false,
    reason: 'crafting_table_dig_failed',
    error: error.message
  };
}

function createRecoveredResult(error) {
  return {
    success: true,
    recovered: true,
    warning: error.message
  };
}

function createNotCollectedFailure() {
  return {
    success: false,
    reason: 'crafting_table_not_collected_after_dig'
  };
}

async function digCraftingTable(bot, freshBlock, targetCount) {
  try {
    await bot.lookAt(freshBlock.position.offset(0.5, 0.5, 0.5), true);
    await bot.dig(freshBlock, true);
    return { success: true };
  } catch (error) {
    if (await waitForItemCount(bot, 'crafting_table', targetCount, 1500)) {
      return createRecoveredResult(error);
    }

    return createDigFailure(error);
  }
}

// Baut einen vom Bot platzierten Crafting Table wieder ab und sammelt ihn ein.
// Soll nur aufgerufen werden, wenn ownedByUs true ist (siehe ensureCraftingTableBlock).
async function releaseCraftingTable(bot, craftingTableBlock) {
  const freshBlock = getFreshCraftingTable(bot, craftingTableBlock);

  if (!freshBlock) return createAlreadyMissingResult();

  if (!canDig(config.worldId, freshBlock.position)) {
    return createProtectedFailure(freshBlock.position);
  }

  const gotoResult = await gotoNearBlock(bot, freshBlock, 3);

  if (!gotoResult.success) return gotoResult;

  await equipBestAxe(bot);

  const targetCount = countItem(bot, 'crafting_table') + 1;
  const digResult = await digCraftingTable(bot, freshBlock, targetCount);

  if (!digResult.success) return digResult;

  if (await waitForItemCount(bot, 'crafting_table', targetCount, 3000)) {
    return digResult.recovered ? digResult : { success: true };
  }

  if (await collectDroppedTableNear(bot, freshBlock.position, targetCount)) {
    return { success: true, reason: 'picked_up_drop' };
  }

  return createNotCollectedFailure();
}

module.exports = {
  CRAFTING_TABLE_SEARCH_DISTANCE,
  PLACED_CRAFTING_TABLE_SEARCH_DISTANCE,
  findNearbyCraftingTable,
  getFreshCraftingTable,
  ensureCraftingTableBlock,
  placeCraftingTableFromInventory,
  releaseCraftingTable
};