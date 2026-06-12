const { goals } = require('mineflayer-pathfinder');
const config = require('../config');
const { canDig } = require('../safety/baseProtector');
const { collectNearbyLog } = require('../actions/collectWood');
const { craftItem } = require('../actions/craftItem');
const { wait, waitTicks } = require('../utils/timing');
const { findItem, hasItem, countItem } = require('../utils/inventory');
const {
  LOG_NAMES,
  PLANK_NAMES,
  planksNameForLog,
  logNameForPlanks,
  countLogs,
  countPlanksOfType,
  countLogsOfType,
  countVirtualPlanksOfType
} = require('../actions/woodTypes');
const craftPlaceCraftingTable = require('./craftPlaceCraftingTable');
const { STATUS } = require('./taskRunner');

const TOOL_TARGETS = ['wooden_pickaxe', 'wooden_axe'];
const MAX_WOOD_PACKAGE_LOOPS = 12;
const CRAFTING_TABLE_SEARCH_DISTANCE = 6;
const PLACED_CRAFTING_TABLE_SEARCH_DISTANCE = 8;

function getAvailableWoodTypes(bot) {
  const inventoryTypes = bot.inventory.items()
    .map(item => getPlanksNameFromWoodItem(item.name))
    .filter(Boolean);

  return [...new Set([...inventoryTypes, ...PLANK_NAMES])];
}

function getPlanksNameFromWoodItem(itemName) {
  if (PLANK_NAMES.includes(itemName)) return itemName;
  if (LOG_NAMES.includes(itemName)) return planksNameForLog(itemName);
  return null;
}

function createWoodPackage(bot, planksName) {
  const logName = logNameForPlanks(planksName);

  return {
    planksName,
    logName,
    planks: countPlanksOfType(bot, planksName),
    logs: countLogsOfType(bot, logName),
    virtualPlanks: countVirtualPlanksOfType(bot, planksName)
  };
}

function compareWoodPackages(a, b) {
  return b.virtualPlanks - a.virtualPlanks;
}

function findBestWoodPackage(bot, targetPlanks) {
  const candidates = getAvailableWoodTypes(bot)
    .map(planksName => createWoodPackage(bot, planksName))
    .sort(compareWoodPackages);

  const ready = candidates.find(candidate => candidate.virtualPlanks >= targetPlanks);

  return {
    ready: ready || null,
    best: candidates[0] || null,
    candidates
  };
}

function describeWoodPackages(bot) {
  return getAvailableWoodTypes(bot)
    .map(planksName => createWoodPackage(bot, planksName))
    .filter(entry => entry.planks > 0 || entry.logs > 0);
}

function missingTools(bot) {
  return TOOL_TARGETS.filter(toolName => !hasItem(bot, toolName));
}

function calculateStickPlan(bot, missingToolCount) {
  const sticksNeededTotal = missingToolCount * 2;
  const sticksMissing = Math.max(0, sticksNeededTotal - countItem(bot, 'stick'));
  const stickCraftsNeeded = Math.ceil(sticksMissing / 4);

  return {
    sticksNeededTotal,
    sticksMissing,
    stickCraftsNeeded,
    planksForStickCrafts: stickCraftsNeeded * 2
  };
}

function calculateToolMaterialPlan(bot) {
  const missing = missingTools(bot);
  const missingToolCount = missing.length;
  const planksForToolBodies = missingToolCount * 3;
  const stickPlan = calculateStickPlan(bot, missingToolCount);

  return {
    missing,
    ...stickPlan,
    planksForToolBodies,
    planksNeededForTools: planksForToolBodies + stickPlan.planksForStickCrafts
  };
}

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

function needsCraftingTableReserve(bot) {
  if (hasItem(bot, 'crafting_table')) return false;
  if (findNearbyCraftingTable(bot, CRAFTING_TABLE_SEARCH_DISTANCE)) return false;
  return true;
}

async function stopPathfinder(bot) {
  if (bot.pathfinder) bot.pathfinder.setGoal(null);

  if (typeof bot.clearControlStates === 'function') {
    bot.clearControlStates();
  }

  await waitTicks(bot, 2);
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
    await bot.pathfinder.goto(goal);
    return { success: true };
  } catch (error) {
    await stopPathfinder(bot);
    return createPathFailure(label, error);
  }
}

function createGoalNearPosition(position, range) {
  return new goals.GoalNear(position.x, position.y, position.z, range);
}

async function gotoNearBlock(bot, block, range = 3) {
  return safeGoto(bot, createGoalNearPosition(block.position, range), `goto_${block.name}`);
}

async function safeCraft(bot, itemName, amount, craftingTable = null) {
  try {
    return await craftItem(bot, itemName, amount, craftingTable);
  } catch (error) {
    return {
      success: false,
      reason: 'craft_error',
      itemName,
      error: error.message
    };
  }
}

function createCollectLogsFailure(collectResult, bot) {
  return {
    success: false,
    reason: 'collect_logs_failed',
    collectResult,
    packages: describeWoodPackages(bot)
  };
}

function createNoWoodProgressFailure(targetPlanks, bot) {
  return {
    success: false,
    reason: 'wood_package_no_progress',
    targetPlanks,
    packages: describeWoodPackages(bot)
  };
}

function createWoodPackageNotReachedFailure(targetPlanks, bot) {
  return {
    success: false,
    reason: 'wood_package_not_reached',
    targetPlanks,
    packages: describeWoodPackages(bot)
  };
}

function getBestVirtualPlanks(packageState) {
  return packageState.best ? packageState.best.virtualPlanks : 0;
}

async function collectOneMoreLog(bot) {
  return collectNearbyLog(bot, {
    minLogCount: countLogs(bot) + 1,
    maxDistance: 32,
    attempts: 5
  });
}

async function collectLogsUntilWoodPackage(bot, targetPlanks) {
  let lastBestVirtualPlanks = -1;

  for (let loop = 1; loop <= MAX_WOOD_PACKAGE_LOOPS; loop++) {
    const packageState = findBestWoodPackage(bot, targetPlanks);

    if (packageState.ready) {
      return {
        success: true,
        package: packageState.ready
      };
    }

    const collectResult = await collectOneMoreLog(bot);

    if (!collectResult.success) return createCollectLogsFailure(collectResult, bot);

    await waitTicks(bot, 2);

    const currentBestVirtualPlanks = getBestVirtualPlanks(findBestWoodPackage(bot, targetPlanks));

    if (currentBestVirtualPlanks <= lastBestVirtualPlanks) {
      return createNoWoodProgressFailure(targetPlanks, bot);
    }

    lastBestVirtualPlanks = currentBestVirtualPlanks;
  }

  return createWoodPackageNotReachedFailure(targetPlanks, bot);
}

function createNoMatchingLogsResult(bot, planksName, logName, targetPlanks) {
  return {
    success: false,
    reason: 'no_matching_logs_to_convert',
    planksName,
    logName,
    planks: countPlanksOfType(bot, planksName),
    targetPlanks
  };
}

function createPlanksCraftFailure(craftResult, planksName, logName) {
  return {
    success: false,
    reason: 'planks_craft_failed',
    craftResult,
    planksName,
    logName
  };
}

function createPlanksNoIncreaseFailure(bot, beforePlanks, planksName) {
  return {
    success: false,
    reason: 'matching_planks_count_did_not_increase',
    beforePlanks,
    afterPlanks: countPlanksOfType(bot, planksName),
    planksName
  };
}

function calculatePlankCraftsNeeded(bot, planksName, targetPlanks, logCount) {
  const missingPlanks = targetPlanks - countPlanksOfType(bot, planksName);
  const craftsNeeded = Math.ceil(missingPlanks / 4);
  return Math.min(craftsNeeded, logCount);
}

async function craftMatchingPlanks(bot, planksName, logName, targetPlanks) {
  const logItem = findItem(bot, logName);

  if (!logItem) return createNoMatchingLogsResult(bot, planksName, logName, targetPlanks);

  const craftsPossible = calculatePlankCraftsNeeded(bot, planksName, targetPlanks, logItem.count);
  const beforePlanks = countPlanksOfType(bot, planksName);
  const craftResult = await safeCraft(bot, planksName, craftsPossible, null);

  if (!craftResult.success) return createPlanksCraftFailure(craftResult, planksName, logName);

  await waitTicks(bot, 2);

  if (countPlanksOfType(bot, planksName) <= beforePlanks) {
    return createPlanksNoIncreaseFailure(bot, beforePlanks, planksName);
  }

  return { success: true };
}

async function craftLogsToReachPlankPackage(bot, planksName, targetPlanks) {
  const logName = logNameForPlanks(planksName);

  while (countPlanksOfType(bot, planksName) < targetPlanks) {
    const result = await craftMatchingPlanks(bot, planksName, logName, targetPlanks);
    if (!result.success) return result;
  }

  return { success: true };
}

function getCraftingTableReserve(bot) {
  return needsCraftingTableReserve(bot) ? 4 : 0;
}

function getTargetSameWoodPlanks(plan, reserveForCraftingTable) {
  return plan.planksNeededForTools + reserveForCraftingTable;
}

function createAlreadyHasToolsResult(plan) {
  return {
    success: true,
    reason: 'already_has_tools',
    plan
  };
}

async function ensurePlankPackage(bot, targetSameWoodPlanks) {
  const packageResult = await collectLogsUntilWoodPackage(bot, targetSameWoodPlanks);

  if (!packageResult.success) return packageResult;

  const planksResult = await craftLogsToReachPlankPackage(
    bot,
    packageResult.package.planksName,
    targetSameWoodPlanks
  );

  if (!planksResult.success) return planksResult;

  return {
    success: true,
    planksName: packageResult.package.planksName
  };
}

async function ensureToolMaterials(bot) {
  const plan = calculateToolMaterialPlan(bot);

  if (plan.missing.length === 0) return createAlreadyHasToolsResult(plan);

  const reserveForCraftingTable = getCraftingTableReserve(bot);
  const targetSameWoodPlanks = getTargetSameWoodPlanks(plan, reserveForCraftingTable);
  const packageResult = await ensurePlankPackage(bot, targetSameWoodPlanks);

  if (!packageResult.success) return packageResult;

  return {
    success: true,
    plan,
    reserveForCraftingTable,
    planksName: packageResult.planksName
  };
}

async function useExistingCraftingTable(bot, craftingTableBlock) {
  const gotoResult = await gotoNearBlock(bot, craftingTableBlock, 3);

  if (!gotoResult.success) return gotoResult;

  return {
    success: true,
    block: bot.blockAt(craftingTableBlock.position),
    source: 'nearby'
  };
}

function createCraftingTableTaskFailure(tableTaskStatus) {
  return {
    success: false,
    reason: 'craft_place_crafting_table_failed',
    tableTaskStatus
  };
}

function createPlacedCraftingTableMissingFailure() {
  return {
    success: false,
    reason: 'placed_crafting_table_not_found'
  };
}

async function placeNewCraftingTable(bot) {
  const tableTaskStatus = await craftPlaceCraftingTable.run(bot);

  if (tableTaskStatus !== STATUS.SUCCESS) return createCraftingTableTaskFailure(tableTaskStatus);

  await waitTicks(bot, 4);

  const placedTable = findNearbyCraftingTable(bot, PLACED_CRAFTING_TABLE_SEARCH_DISTANCE);

  if (!placedTable) return createPlacedCraftingTableMissingFailure();

  const gotoResult = await gotoNearBlock(bot, placedTable, 3);

  if (!gotoResult.success) return gotoResult;

  return {
    success: true,
    block: bot.blockAt(placedTable.position),
    source: 'placed_by_task'
  };
}

async function ensureCraftingTableBlock(bot) {
  const existingTable = findNearbyCraftingTable(bot, CRAFTING_TABLE_SEARCH_DISTANCE);

  if (existingTable) return useExistingCraftingTable(bot, existingTable);

  return placeNewCraftingTable(bot);
}

async function ensureMaterialsAfterTable(bot, plan) {
  return ensurePlankPackage(bot, plan.planksNeededForTools);
}

function createSticksCraftFailure(sticksResult) {
  return {
    success: false,
    reason: 'sticks_craft_failed',
    sticksResult
  };
}

function createNotEnoughSticksFailure(bot, plan) {
  return {
    success: false,
    reason: 'not_enough_sticks_after_craft',
    sticks: countItem(bot, 'stick'),
    needed: plan.sticksNeededTotal
  };
}

async function craftRequiredSticks(bot, plan) {
  if (plan.stickCraftsNeeded <= 0) {
    return { success: true, reason: 'already_has_enough_sticks' };
  }

  const sticksResult = await safeCraft(bot, 'stick', plan.stickCraftsNeeded, null);

  if (!sticksResult.success) return createSticksCraftFailure(sticksResult);

  if (countItem(bot, 'stick') < plan.sticksNeededTotal) {
    return createNotEnoughSticksFailure(bot, plan);
  }

  return { success: true };
}

function createMissingCraftingTableBeforeToolFailure(toolName) {
  return {
    success: false,
    reason: 'crafting_table_missing_before_tool_craft',
    toolName
  };
}

function createToolCraftFailure(toolName, craftResult) {
  return {
    success: false,
    reason: 'tool_craft_failed',
    toolName,
    craftResult
  };
}

function createToolMissingAfterCraftFailure(toolName) {
  return {
    success: false,
    reason: 'tool_missing_after_craft',
    toolName
  };
}

function getFreshCraftingTable(bot, craftingTableBlock) {
  const tableBlock = bot.blockAt(craftingTableBlock.position);

  if (!tableBlock || tableBlock.name !== 'crafting_table') return null;

  return tableBlock;
}

async function craftMissingTool(bot, toolName, craftingTableBlock) {
  if (hasItem(bot, toolName)) return { success: true, reason: 'already_has_tool' };

  const tableBlock = getFreshCraftingTable(bot, craftingTableBlock);

  if (!tableBlock) return createMissingCraftingTableBeforeToolFailure(toolName);

  const craftResult = await safeCraft(bot, toolName, 1, tableBlock);

  if (!craftResult.success) return createToolCraftFailure(toolName, craftResult);

  if (!hasItem(bot, toolName)) return createToolMissingAfterCraftFailure(toolName);

  return { success: true };
}

async function craftMissingTools(bot, craftingTableBlock) {
  for (const toolName of TOOL_TARGETS) {
    const result = await craftMissingTool(bot, toolName, craftingTableBlock);
    if (!result.success) return result;
  }

  return { success: true };
}

function findBestToolForCraftingTable(bot) {
  const preferred = [
    'netherite_axe',
    'diamond_axe',
    'iron_axe',
    'stone_axe',
    'wooden_axe',
    'golden_axe'
  ];

  for (const itemName of preferred) {
    const item = findItem(bot, itemName);
    if (item) return item;
  }

  return null;
}

async function waitForItemCount(bot, itemName, targetCount, timeoutMs = 4000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (countItem(bot, itemName) >= targetCount) return true;
    await wait(150);
  }

  return countItem(bot, itemName) >= targetCount;
}

function isDroppedItemEntity(entity) {
  return entity && entity.name === 'item' && entity.position;
}

function findDroppedItemNear(bot, position, maxDistance = 6) {
  return Object.values(bot.entities).find(entity => {
    if (!isDroppedItemEntity(entity)) return false;
    return entity.position.distanceTo(position) <= maxDistance;
  }) || null;
}

async function collectDroppedItemNear(bot, position, targetCount) {
  const droppedItem = findDroppedItemNear(bot, position, 8);

  if (!droppedItem) return false;

  const goal = createGoalNearPosition(droppedItem.position, 1);

  await safeGoto(bot, goal, 'collect_crafting_table_drop');

  return waitForItemCount(bot, 'crafting_table', targetCount, 3000);
}

function createCraftingTableAlreadyMissingResult() {
  return {
    success: true,
    reason: 'crafting_table_already_missing'
  };
}

function createCraftingTableProtectedFailure(position) {
  return {
    success: false,
    reason: 'crafting_table_is_protected',
    position
  };
}

function createCraftingTableDigFailure(error) {
  return {
    success: false,
    reason: 'crafting_table_dig_failed',
    error: error.message
  };
}

function createCraftingTableRecoveredResult(error) {
  return {
    success: true,
    recovered: true,
    warning: error.message
  };
}

function createCraftingTableNotCollectedFailure() {
  return {
    success: false,
    reason: 'crafting_table_not_collected_after_dig'
  };
}

async function equipBestAxeForCraftingTable(bot) {
  const axe = findBestToolForCraftingTable(bot);

  if (!axe) return;

  await bot.equip(axe, 'hand');
}

async function digCraftingTable(bot, freshBlock, targetCount) {
  try {
    await bot.lookAt(freshBlock.position.offset(0.5, 0.5, 0.5), true);
    await bot.dig(freshBlock, true);
    return { success: true };
  } catch (error) {
    if (await waitForItemCount(bot, 'crafting_table', targetCount, 1500)) {
      return createCraftingTableRecoveredResult(error);
    }

    return createCraftingTableDigFailure(error);
  }
}

async function pickupCraftingTable(bot, craftingTableBlock) {
  const freshBlock = getFreshCraftingTable(bot, craftingTableBlock);

  if (!freshBlock) return createCraftingTableAlreadyMissingResult();

  if (!canDig(config.worldId, freshBlock.position)) {
    return createCraftingTableProtectedFailure(freshBlock.position);
  }

  const gotoResult = await gotoNearBlock(bot, freshBlock, 3);

  if (!gotoResult.success) return gotoResult;

  await equipBestAxeForCraftingTable(bot);

  const targetCount = countItem(bot, 'crafting_table') + 1;
  const digResult = await digCraftingTable(bot, freshBlock, targetCount);

  if (!digResult.success) return digResult;

  if (await waitForItemCount(bot, 'crafting_table', targetCount, 3000)) {
    return digResult.recovered ? digResult : { success: true };
  }

  if (await collectDroppedItemNear(bot, freshBlock.position, targetCount)) {
    return { success: true, reason: 'picked_up_drop' };
  }

  return createCraftingTableNotCollectedFailure();
}

function isSuccess(result) {
  return result.success;
}

async function run(bot) {
  const materialResult = await ensureToolMaterials(bot);

  if (!isSuccess(materialResult)) return STATUS.FAILURE;

  if (materialResult.reason === 'already_has_tools') return STATUS.SUCCESS;

  const tableResult = await ensureCraftingTableBlock(bot);

  if (!isSuccess(tableResult)) return STATUS.FAILURE;

  const refreshPlan = calculateToolMaterialPlan(bot);
  const materialAfterTableResult = await ensureMaterialsAfterTable(bot, refreshPlan);

  if (!isSuccess(materialAfterTableResult)) return STATUS.FAILURE;

  const sticksResult = await craftRequiredSticks(bot, refreshPlan);

  if (!isSuccess(sticksResult)) return STATUS.FAILURE;

  const toolsResult = await craftMissingTools(bot, tableResult.block);

  if (!isSuccess(toolsResult)) return STATUS.FAILURE;

  const pickupResult = await pickupCraftingTable(bot, tableResult.block);

  if (!isSuccess(pickupResult)) return STATUS.FAILURE;

  return STATUS.SUCCESS;
}

module.exports = { run };