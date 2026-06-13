const { collectNearbyLog } = require('../actions/collecting/collectWood');
const { craftItem } = require('../actions/craftItem');
const { placeBlockNearby } = require('../actions/placeBlock');
const { planksNameForLog, countLogs, countPlanks, findLogItem } = require('../data/items/woodTypes');
const { findItem, hasItem } = require('../utils/inventory');
const { STATUS } = require('./taskRunner');

const WOOD_COLLECTION_OPTIONS = {
  minLogCount: 1,
  maxDistance: 32,
  attempts: 3
};

function hasCraftingTable(bot) {
  return hasItem(bot, 'crafting_table');
}

function hasEnoughPlanksForTable(bot) {
  return countPlanks(bot) >= 4;
}

function hasAnyLog(bot) {
  return countLogs(bot) >= 1;
}

function getWoodSourceReadyResult(bot) {
  if (hasCraftingTable(bot)) return { success: true, reason: 'already_has_crafting_table' };
  if (hasEnoughPlanksForTable(bot)) return { success: true, reason: 'already_has_enough_planks' };
  if (hasAnyLog(bot)) return { success: true, reason: 'already_has_log' };

  return null;
}

function createNoLogAfterCollectResult(collectResult) {
  return {
    success: false,
    reason: 'no_log_after_collect',
    collectResult
  };
}

function createCraftFailedResult(reason, resultName, result) {
  return {
    success: false,
    reason,
    [resultName]: result
  };
}

function createNotEnoughPlanksResult(bot) {
  return {
    success: false,
    reason: 'not_enough_planks_after_craft',
    planksCount: countPlanks(bot)
  };
}

async function collectWoodSource(bot) {
  const collectResult = await collectNearbyLog(bot, WOOD_COLLECTION_OPTIONS);

  if (!collectResult.success || !hasAnyLog(bot)) {
    return createNoLogAfterCollectResult(collectResult);
  }

  return { success: true, reason: 'log_collected' };
}

async function ensureWoodSource(bot) {
  const readyResult = getWoodSourceReadyResult(bot);

  if (readyResult) return readyResult;

  return collectWoodSource(bot);
}

async function craftPlanksFromAvailableLog(bot) {
  const logItem = findLogItem(bot);

  if (!logItem) {
    return { success: false, reason: 'no_log_for_planks' };
  }

  const planksName = planksNameForLog(logItem.name);
  const planksResult = await craftItem(bot, planksName, 1);

  if (!planksResult.success) {
    return createCraftFailedResult('planks_craft_failed', 'planksResult', planksResult);
  }

  if (!hasEnoughPlanksForTable(bot)) {
    return createNotEnoughPlanksResult(bot);
  }

  return { success: true };
}

async function ensurePlanks(bot) {
  if (hasEnoughPlanksForTable(bot)) {
    return { success: true, reason: 'already_has_enough_planks' };
  }

  return craftPlanksFromAvailableLog(bot);
}

function createNoCraftingTableResult() {
  return {
    success: false,
    reason: 'no_crafting_table_after_craft'
  };
}

async function craftCraftingTable(bot) {
  const tableResult = await craftItem(bot, 'crafting_table', 1);

  if (!tableResult.success) {
    return createCraftFailedResult('crafting_table_craft_failed', 'tableResult', tableResult);
  }

  if (!hasCraftingTable(bot)) {
    return createNoCraftingTableResult();
  }

  return { success: true };
}

async function ensureCraftingTable(bot) {
  if (hasCraftingTable(bot)) {
    return { success: true, reason: 'already_has_crafting_table' };
  }

  const planksReady = await ensurePlanks(bot);

  if (!planksReady.success) return planksReady;

  return craftCraftingTable(bot);
}

async function placeCraftingTable(bot) {
  const tableItem = findItem(bot, 'crafting_table');

  if (!tableItem) return { success: false, reason: 'no_crafting_table_in_inventory' };

  return placeBlockNearby(bot, tableItem);
}

async function run(bot) {
  const woodReady = await ensureWoodSource(bot);

  if (!woodReady.success) return STATUS.FAILURE;

  const tableReady = await ensureCraftingTable(bot);

  if (!tableReady.success) return STATUS.FAILURE;

  const placeResult = await placeCraftingTable(bot);

  if (!placeResult.success) return STATUS.FAILURE;

  return STATUS.SUCCESS;
}

module.exports = { run };