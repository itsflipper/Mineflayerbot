const mcDataLoader = require('minecraft-data');
const { countItem } = require('../utils/inventory');
const {
  LOG_NAMES,
  PLANK_NAMES,
  isLogName,
  isPlanksName,
  logNameForPlanks,
  planksNameForLog,
  countVirtualPlanksOfType
} = require('../actions/woodTypes');

// Reihenfolge ist wichtig: jedes Item in dieser Liste darf nur Items konsumieren,
// die WEITER UNTEN in der Liste stehen ('planks' und 'log' werden über die
// gewählte Materialgruppe aufgelöst). So sind beim Verarbeiten eines Items
// bereits alle Bedarfe eingerechnet, die andere Items an dieses Item stellen.
const CRAFT_ORDER = ['wooden_pickaxe', 'wooden_axe', 'crafting_table', 'stick', 'planks', 'log'];

function isSupportedTargetName(itemName) {
  if (itemName === 'wooden_pickaxe' || itemName === 'wooden_axe') return true;
  if (itemName === 'crafting_table' || itemName === 'stick') return true;
  if (isPlanksName(itemName)) return true;
  if (isLogName(itemName)) return true;

  return false;
}

function createTargetEntries(bot, targets) {
  return targets.map(target => {
    const available = countItem(bot, target.name);
    const missing = Math.max(0, target.count - available);

    return {
      name: target.name,
      count: target.count,
      available,
      missing
    };
  });
}

// Wählt das Holzpaket (Planks-/Log-Name), das für diesen Plan verwendet wird.
// Wird ein konkreter *_planks oder *_log direkt als Ziel verlangt, bestimmt das
// die Gruppe. Sonst wird das Holzpaket gewählt, von dem der Bot aktuell am
// meisten (in "virtuellen Planks") besitzt - mit oak_planks als stabilem Default.
function selectMaterialGroup(bot, targets) {
  const explicitPlanksTarget = targets.find(target => isPlanksName(target.name));
  if (explicitPlanksTarget) {
    return {
      planksName: explicitPlanksTarget.name,
      logName: logNameForPlanks(explicitPlanksTarget.name)
    };
  }

  const explicitLogTarget = targets.find(target => isLogName(target.name));
  if (explicitLogTarget) {
    return {
      planksName: planksNameForLog(explicitLogTarget.name),
      logName: explicitLogTarget.name
    };
  }

  const candidates = PLANK_NAMES.map(planksName => ({
    planksName,
    logName: logNameForPlanks(planksName),
    virtualPlanks: countVirtualPlanksOfType(bot, planksName)
  }));

  candidates.sort((a, b) => b.virtualPlanks - a.virtualPlanks);

  return candidates[0];
}

function resolveSlotName(slot, materialGroup) {
  if (slot === 'planks') return materialGroup.planksName;
  if (slot === 'log') return materialGroup.logName;

  return slot;
}

// recipesAll() statt recipesFor(): liefert alle bekannten Rezepte für ein Item,
// unabhängig davon, ob der Bot die Zutaten aktuell besitzt. craftItem.js nutzt
// weiterhin recipesFor() zur Ausführung - hier geht es um Planung.
function getRecipeVariants(mcData, bot, itemName) {
  const item = mcData.itemsByName[itemName];
  if (!item) return [];

  const withTable = bot.recipesAll(item.id, null, true) || [];
  if (withTable.length > 0) return withTable;

  return bot.recipesAll(item.id, null, null) || [];
}

// Sammelt Zutaten-Mengen aus einem Recipe-Objekt. Bevorzugt recipe.delta
// (negative Einträge = Zutaten), fällt für ältere/abweichende Formate auf
// recipe.ingredients bzw. recipe.inShape zurück.
function countOccurrences(cells) {
  const counts = new Map();

  for (const cell of cells) {
    if (cell === null || cell === undefined || cell === -1) continue;

    const id = (typeof cell === 'object') ? cell.id : cell;
    if (id === null || id === undefined || id === -1) continue;

    counts.set(id, (counts.get(id) || 0) + 1);
  }

  return counts;
}

function getIngredientCounts(recipe) {
  if (Array.isArray(recipe.delta) && recipe.delta.length > 0) {
    const counts = new Map();

    for (const entry of recipe.delta) {
      if (entry.count >= 0) continue;
      counts.set(entry.id, (counts.get(entry.id) || 0) + (-entry.count));
    }

    return counts;
  }

  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
    return countOccurrences(recipe.ingredients);
  }

  if (Array.isArray(recipe.inShape)) {
    return countOccurrences(recipe.inShape.flat());
  }

  return new Map();
}

function getIngredients(mcData, recipe) {
  const counts = getIngredientCounts(recipe);
  const ingredients = [];

  for (const [id, count] of counts) {
    const item = mcData.items[id];
    if (!item) continue;

    ingredients.push({ name: item.name, count });
  }

  return ingredients;
}

// Bei mehreren Rezeptvarianten (z. B. ein Stick-Rezept pro Holzart) wird die
// Variante gewählt, deren Zutaten zur gewählten Materialgruppe passen.
function findRecipeForGroup(mcData, bot, itemName, materialGroup) {
  const variants = getRecipeVariants(mcData, bot, itemName);

  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  const matching = variants.find(recipe =>
    getIngredients(mcData, recipe).some(ingredient =>
      ingredient.name === materialGroup.planksName || ingredient.name === materialGroup.logName
    )
  );

  return matching || variants[0];
}

function createEmptyPlanResult(targetEntries, alreadyAvailable, missingTargets, warnings, success) {
  return {
    success,
    targets: targetEntries,
    alreadyAvailable,
    missingTargets,
    baseMaterialsNeeded: [],
    baseMaterialsMissing: [],
    intermediateCrafts: [],
    finalCrafts: [],
    requiresCraftingTable: false,
    selectedMaterialGroup: null,
    warnings
  };
}

function checkRecipePlan(bot, targets) {
  const mcData = mcDataLoader(bot.version);
  const targetEntries = createTargetEntries(bot, targets);

  const alreadyAvailable = targetEntries.filter(entry => entry.missing === 0);
  const missingTargets = targetEntries.filter(entry => entry.missing > 0);

  const warnings = [];
  const supportedMissingTargets = missingTargets.filter(entry => isSupportedTargetName(entry.name));

  for (const entry of missingTargets) {
    if (!isSupportedTargetName(entry.name)) {
      warnings.push({ reason: 'unsupported_target', name: entry.name });
    }
  }

  if (supportedMissingTargets.length === 0) {
    const success = supportedMissingTargets.length === missingTargets.length;
    return createEmptyPlanResult(targetEntries, alreadyAvailable, missingTargets, warnings, success);
  }

  const materialGroup = selectMaterialGroup(bot, supportedMissingTargets);

  const neededCounts = {};
  for (const entry of supportedMissingTargets) {
    neededCounts[entry.name] = (neededCounts[entry.name] || 0) + entry.missing;
  }

  const baseMaterialsNeeded = [];
  const baseMaterialsMissing = [];
  const crafts = [];
  let requiresCraftingTable = false;

  for (const slot of CRAFT_ORDER) {
    const itemName = resolveSlotName(slot, materialGroup);
    const needed = neededCounts[itemName] || 0;

    if (needed === 0) continue;

    const available = countItem(bot, itemName);
    const missing = Math.max(0, needed - available);

    if (missing === 0) continue;

    if (isLogName(itemName)) {
      baseMaterialsNeeded.push({ name: itemName, needed, available, missing });
      baseMaterialsMissing.push({ name: itemName, missing });
      continue;
    }

    const recipe = findRecipeForGroup(mcData, bot, itemName, materialGroup);

    if (!recipe) {
      warnings.push({ reason: 'no_recipe_found', name: itemName });
      continue;
    }

    const resultCount = recipe.result.count || 1;
    const craftsNeeded = Math.ceil(missing / resultCount);

    if (recipe.requiresTable) requiresCraftingTable = true;

    crafts.push({
      name: itemName,
      needed,
      available,
      missing,
      craftsNeeded,
      producesCount: craftsNeeded * resultCount,
      requiresTable: Boolean(recipe.requiresTable),
      isFinalTarget: supportedMissingTargets.some(entry => entry.name === itemName)
    });

    for (const ingredient of getIngredients(mcData, recipe)) {
      neededCounts[ingredient.name] = (neededCounts[ingredient.name] || 0) + ingredient.count * craftsNeeded;
    }
  }

  const finalCrafts = crafts.filter(craft => craft.isFinalTarget);
  const intermediateCrafts = crafts.filter(craft => !craft.isFinalTarget);

  return {
    success: true,
    targets: targetEntries,
    alreadyAvailable,
    missingTargets: supportedMissingTargets,
    baseMaterialsNeeded,
    baseMaterialsMissing,
    intermediateCrafts,
    finalCrafts,
    requiresCraftingTable,
    selectedMaterialGroup: materialGroup.planksName.replace('_planks', ''),
    selectedWoodPackage: materialGroup,
    warnings
  };
}

module.exports = { checkRecipePlan };