const { checkRecipePlan } = require('./checkRecipes');
const { collectMissingBaseMaterials } = require('./smartCollector');
const {
  findNearbyCraftingTable,
  ensureCraftingTableBlock,
  placeCraftingTableFromInventory,
  releaseCraftingTable,
  getFreshCraftingTable,
  CRAFTING_TABLE_SEARCH_DISTANCE
} = require('./craftingTableProvider');
const { craftItem } = require('../actions/craftItem');
const { hasItem } = require('../utils/inventory');

const CRAFTING_TABLE_TARGET = { name: 'crafting_table', count: 1 };

// checkRecipePlan liefert intermediateCrafts/finalCrafts bereits in
// topologischer Reihenfolge (Abhängigkeiten zuerst) - hier nur konkatenieren.
function getAllCrafts(plan) {
  return plan.orderedCrafts;
}

function planNeedsCraftingTable(plan) {
  return plan.requiresCraftingTable;
}

function planAlreadyTargetsCraftingTable(targets) {
  return targets.some(target => target.name === 'crafting_table');
}

// Prüft, ob ein Crafting Table organisch erreichbar ist (Inventar oder Welt).
// Wenn nicht, und der Plan einen Tisch braucht, muss 'crafting_table' selbst
// als zusätzliches Craft-Ziel eingeplant werden.
function craftingTableIsAvailable(bot) {
  if (hasItem(bot, 'crafting_table')) return true;
  if (findNearbyCraftingTable(bot, CRAFTING_TABLE_SEARCH_DISTANCE)) return true;

  return false;
}

function buildTargetsWithCraftingTable(targets) {
  if (planAlreadyTargetsCraftingTable(targets)) return targets;

  return [...targets, CRAFTING_TABLE_TARGET];
}

// Erweitert die targets um 'crafting_table', falls der Plan einen Tisch
// braucht, aber weder im Inventar noch in der Nähe vorhanden ist.
function resolveEffectiveTargets(bot, targets, plan) {
  if (!planNeedsCraftingTable(plan)) return targets;
  if (craftingTableIsAvailable(bot)) return targets;

  return buildTargetsWithCraftingTable(targets);
}

function createCollectFailure(collectResult) {
  return {
    success: false,
    reason: 'collect_missing_base_materials_failed',
    collectResult
  };
}

async function ensureBaseMaterials(bot, plan, options) {
  if (plan.baseMaterialsMissing.length === 0) {
    return { success: true, plan };
  }

  const collectResult = await collectMissingBaseMaterials(bot, plan, options);

  if (!collectResult.success) return createCollectFailure(collectResult);

  return { success: true, plan: null, collectResult };
}

function createCraftFailure(craft, craftResult) {
  return {
    success: false,
    reason: 'craft_failed',
    itemName: craft.name,
    craftResult
  };
}

async function executeCraft(bot, craft, craftingTableBlock) {
  const table = craft.requiresTable ? craftingTableBlock : null;

  const craftResult = await craftItem(bot, craft.name, craft.craftsNeeded, table);

  if (!craftResult.success) return createCraftFailure(craft, craftResult);

  return { success: true, itemName: craft.name };
}

function createTableMissingFailure(craft) {
  return {
    success: false,
    reason: 'crafting_table_missing_for_craft',
    itemName: craft.name
  };
}

// Führt alle Crafts in Abhängigkeitsreihenfolge aus. 'crafting_table' wird,
// sobald gecraftet, sofort platziert und als craftingTable für die
// nachfolgenden Crafts verwendet (falls noch kein Tisch verfügbar war).
async function executeCrafts(bot, crafts, tableState) {
  for (const craft of crafts) {
    if (craft.requiresTable && !tableState.block) {
      return { success: false, failure: createTableMissingFailure(craft) };
    }

    const result = await executeCraft(bot, craft, tableState.block);

    if (!result.success) return { success: false, failure: result };

    if (craft.name === 'crafting_table' && !tableState.block) {
      const placeResult = await placeCraftingTableFromInventory(bot, 'placed_from_plan');

      if (!placeResult.success) {
        return { success: false, failure: placeResult };
      }

      tableState.block = placeResult.block;
      tableState.ownedByUs = true;
    }
  }

  return { success: true };
}

function createTableSetupFailure(tableResult) {
  return {
    success: false,
    reason: 'crafting_table_setup_failed',
    tableResult
  };
}

async function setupCraftingTable(bot, plan) {
  const tableState = { block: null, ownedByUs: false };

  if (!planNeedsCraftingTable(plan)) return { success: true, tableState };

  if (!craftingTableIsAvailable(bot)) {
    // Kein Tisch verfügbar - wird während executeCrafts aus dem frisch
    // gecrafteten 'crafting_table' platziert (siehe oben).
    return { success: true, tableState };
  }

  const tableResult = await ensureCraftingTableBlock(bot);

  if (!tableResult.success) return { success: false, failure: createTableSetupFailure(tableResult) };

  tableState.block = tableResult.block;
  tableState.ownedByUs = tableResult.ownedByUs;

  return { success: true, tableState };
}

function createReleaseWarning(releaseResult) {
  return {
    reason: 'crafting_table_release_failed',
    releaseResult
  };
}

async function releaseOwnedCraftingTable(bot, tableState, warnings) {
  if (!tableState.ownedByUs || !tableState.block) return;

  const freshBlock = getFreshCraftingTable(bot, tableState.block);
  if (!freshBlock) return;

  const releaseResult = await releaseCraftingTable(bot, freshBlock);

  if (!releaseResult.success) {
    warnings.push(createReleaseWarning(releaseResult));
  }
}

// Führt die komplette smarte Crafting-Pipeline für die gegebenen Ziele aus:
//  1. checkRecipes plant
//  2. falls nötig wird 'crafting_table' als zusätzliches Ziel ergänzt und neu geplant
//  3. smartCollector sammelt fehlende Grundmaterialien (Logs)
//  4. checkRecipes plant erneut (Inventar kann sich geändert haben)
//  5. Crafting Table wird bereitgestellt (vorhanden, aus Inventar, oder aus dem Plan gecraftet)
//  6. alle Crafts werden in Abhängigkeitsreihenfolge ausgeführt
//  7. ein vom Bot platzierter Crafting Table wird wieder abgebaut und eingesammelt
async function smartCraft(bot, targets, options = {}) {
  const warnings = [];

  let plan = checkRecipePlan(bot, targets);
  if (!plan.success) return { success: false, reason: 'recipe_plan_failed', plan };

  const effectiveTargets = resolveEffectiveTargets(bot, targets, plan);
  if (effectiveTargets !== targets) {
    plan = checkRecipePlan(bot, effectiveTargets);
    if (!plan.success) return { success: false, reason: 'recipe_plan_failed', plan };
  }

  const collectStep = await ensureBaseMaterials(bot, plan, options);
  if (!collectStep.success) return collectStep;

  if (collectStep.plan === null) {
    plan = checkRecipePlan(bot, effectiveTargets);
    if (!plan.success) return { success: false, reason: 'recipe_plan_failed', plan };
  }

  const tableSetup = await setupCraftingTable(bot, plan);
  if (!tableSetup.success) return tableSetup.failure;

  const tableState = tableSetup.tableState;
  const crafts = getAllCrafts(plan);

  const craftStep = await executeCrafts(bot, crafts, tableState);
  if (!craftStep.success) {
    await releaseOwnedCraftingTable(bot, tableState, warnings);
    return craftStep.failure;
  }

  await releaseOwnedCraftingTable(bot, tableState, warnings);

  return {
    success: true,
    plan,
    crafted: crafts.map(craft => craft.name),
    warnings
  };
}

module.exports = { smartCraft };