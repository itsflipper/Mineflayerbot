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

// Items, die TROTZ vorhandenem Rezept als Grundmaterial gelten sollen
// (der Bot soll sie sammeln/beschaffen, nicht craften/smelten).
// Bewusst klein und additiv erweiterbar.
const BASE_MATERIAL_OVERRIDES = [
  /_ingot$/,
  /_nugget$/,
  /^raw_/,
  /^andesite$/,
  /^diorite$/,
  /^granite$/
];

function isOverriddenBaseMaterial(itemName) {
  return BASE_MATERIAL_OVERRIDES.some(pattern => pattern.test(itemName));
}

// ---------------------------------------------------------------------
// Zielitems: vorhanden vs. fehlend
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// Materialgruppen (Holz: über woodTypes.js, generisch: über Rezeptvarianten)
// ---------------------------------------------------------------------

// Wählt das Holzpaket (Planks-/Log-Name) für den Plan. Ein explizit verlangtes
// *_planks oder *_log bestimmt die Gruppe. Sonst wird das Holzpaket gewählt,
// von dem der Bot aktuell am meisten (in "virtuellen Planks") besitzt -
// mit oak_planks als stabilem Default.
function selectWoodPackage(bot, targets) {
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

function isWoodGroupItem(itemName) {
  return isLogName(itemName) || isPlanksName(itemName);
}

// Bildet einen konkreten Holz-Itemnamen (z.B. 'birch_log') auf den Namen ab,
// der zur gewählten Holzgruppe gehört (z.B. 'oak_log'), damit alle
// austauschbaren Holzvarianten als EIN Item im Bedarfsbaum behandelt werden.
function resolveWoodGroupItemName(itemName, woodPackage) {
  if (isLogName(itemName)) return woodPackage.logName;
  if (isPlanksName(itemName)) return woodPackage.planksName;
  return itemName;
}

// ---------------------------------------------------------------------
// Rezept-Hilfsfunktionen
// ---------------------------------------------------------------------

function getRecipeVariants(mcData, bot, itemName) {
  const item = mcData.itemsByName[itemName];
  if (!item) return [];

  const withTable = bot.recipesAll(item.id, null, true) || [];
  if (withTable.length > 0) return withTable;

  return bot.recipesAll(item.id, null, null) || [];
}

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

// Erzeugt einen "Form-Schlüssel" für ein Rezept: Zutatenmengen, sortiert,
// ohne Itemnamen. Zwei Rezepte mit gleicher Form sind potentiell
// austauschbare Varianten (z.B. ein Stick-Rezept pro Holzart).
function getRecipeShapeKey(mcData, recipe) {
  const counts = [...getIngredientCounts(recipe).values()].sort((a, b) => a - b);
  return `${counts.join(',')}|table=${Boolean(recipe.requiresTable)}|result=${recipe.result.count || 1}`;
}

// Wählt aus mehreren Rezeptvarianten diejenige, deren Zutaten am besten zum
// bisher aufgebauten Plan passen: bevorzugt Zutaten, die zur gewählten
// Holzgruppe gehören oder bereits anderswo im Plan benötigt werden
// (chosenGroupItems), sonst die Variante mit dem höchsten Inventarbestand
// der Zutaten, sonst die erste Variante.
function pickBestVariant(mcData, bot, variants, woodPackage, chosenGroupItems) {
  if (variants.length <= 1) return variants[0] || null;

  const scored = variants.map(recipe => {
    const ingredients = getIngredients(mcData, recipe);

    let score = 0;
    for (const ingredient of ingredients) {
      if (
        ingredient.name === woodPackage.planksName ||
        ingredient.name === woodPackage.logName
      ) {
        score += 1000;
      }

      if (chosenGroupItems.has(ingredient.name)) {
        score += 500;
      }

      score += countItem(bot, ingredient.name);
    }

    return { recipe, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored[0].recipe;
}

// ---------------------------------------------------------------------
// BFS-Worklist: baut den Bedarfsbaum auf und liefert eine Liste von
// "crafts" bereits in topologischer Reihenfolge (Blätter zuerst).
// ---------------------------------------------------------------------

function checkRecipePlan(bot, targets) {
  const mcData = mcDataLoader(bot.version);
  const targetEntries = createTargetEntries(bot, targets);

  const alreadyAvailable = targetEntries.filter(entry => entry.missing === 0);
  const missingTargets = targetEntries.filter(entry => entry.missing > 0);

  const warnings = [];

  if (missingTargets.length === 0) {
    return {
      success: true,
      targets: targetEntries,
      alreadyAvailable,
      missingTargets,
      baseMaterialsNeeded: [],
      baseMaterialsMissing: [],
      orderedCrafts: [],
      requiresCraftingTable: false,
      selectedMaterialGroup: null,
      selectedWoodPackage: null,
      warnings
    };
  }

  const woodPackage = selectWoodPackage(bot, missingTargets);

  // neededCounts: wie viel von jedem (gruppen-aufgelösten) Item insgesamt
  // gebraucht wird. Holzvarianten werden sofort auf die gewählte
  // Holzgruppe gemappt, damit sie als ein Item behandelt werden.
  const neededCounts = new Map();
  const finalTargetNames = new Set();
  const chosenGroupItems = new Set([woodPackage.planksName, woodPackage.logName]);

  function addNeed(itemNameRaw, amount) {
    const itemName = isWoodGroupItem(itemNameRaw)
      ? resolveWoodGroupItemName(itemNameRaw, woodPackage)
      : itemNameRaw;

    neededCounts.set(itemName, (neededCounts.get(itemName) || 0) + amount);
    return itemName;
  }

  const queue = [];

  for (const entry of missingTargets) {
    const resolvedName = addNeed(entry.name, entry.missing);
    finalTargetNames.add(resolvedName);
    queue.push(resolvedName);
  }

  const visited = new Set();
  const processedAmount = new Map();
  const craftsByName = new Map();
  const dependsOn = new Map();

  const baseMaterialsNeeded = [];
  const baseMaterialsMissing = [];
  let requiresCraftingTable = false;

  while (queue.length > 0) {
    const itemName = queue.shift();

    const needed = neededCounts.get(itemName) || 0;
    const alreadyProcessed = processedAmount.get(itemName) || 0;

    // Bereits verarbeitet und der Bedarf hat sich seitdem nicht erhöht
    // (z.B. weil ein anderer Konsument denselben Bedarf später anmeldet) ->
    // nichts zu tun.
    if (visited.has(itemName) && needed <= alreadyProcessed) continue;

    visited.add(itemName);
    processedAmount.set(itemName, needed);

    if (needed === 0) continue;

    const available = countItem(bot, itemName);
    const missing = Math.max(0, needed - available);

    if (missing === 0) continue;

    const isBaseMaterial = isOverriddenBaseMaterial(itemName)
      ? true
      : getRecipeVariants(mcData, bot, itemName).length === 0;

    if (isBaseMaterial) {
      const existingIndex = baseMaterialsMissing.findIndex(e => e.name === itemName);
      const entry = { name: itemName, needed, available, missing };

      if (existingIndex === -1) {
        baseMaterialsNeeded.push(entry);
        baseMaterialsMissing.push(entry);
      } else {
        baseMaterialsNeeded[existingIndex] = entry;
        baseMaterialsMissing[existingIndex] = entry;
      }

      continue;
    }

    const variants = getRecipeVariants(mcData, bot, itemName);
    const recipe = pickBestVariant(mcData, bot, variants, woodPackage, chosenGroupItems);

    if (!recipe) {
      warnings.push({ reason: 'no_recipe_found', name: itemName });
      continue;
    }

    const resultCount = recipe.result.count || 1;
    const craftsNeeded = Math.ceil(missing / resultCount);

    const previousMissing = Math.max(0, alreadyProcessed - countItem(bot, itemName));
    const previousCraftsNeeded = Math.ceil(previousMissing / resultCount);
    const deltaCraftsNeeded = craftsNeeded - previousCraftsNeeded;

    if (recipe.requiresTable) requiresCraftingTable = true;

    const ingredients = getIngredients(mcData, recipe);
    const ingredientNames = [];

    for (const ingredient of ingredients) {
      const resolvedIngredientName = addNeed(ingredient.name, ingredient.count * deltaCraftsNeeded);
      ingredientNames.push(resolvedIngredientName);
      chosenGroupItems.add(resolvedIngredientName);

      // Re-Queue auch dann, wenn das Item bereits verarbeitet wurde - der
      // Bedarfs-Check oben (needed <= alreadyProcessed) sortiert No-Ops aus.
      queue.push(resolvedIngredientName);
    }

    dependsOn.set(itemName, ingredientNames);

    craftsByName.set(itemName, {
      name: itemName,
      needed,
      available,
      missing,
      craftsNeeded,
      producesCount: craftsNeeded * resultCount,
      requiresTable: Boolean(recipe.requiresTable),
      isFinalTarget: finalTargetNames.has(itemName)
    });
  }

  // Topologische Sortierung (Blätter zuerst): wiederholt Items einsammeln,
  // deren Abhängigkeiten bereits eingeordnet (oder keine Crafts) sind.
  const orderedCrafts = [];
  const placed = new Set();
  const remaining = new Set(craftsByName.keys());

  function dependenciesSatisfied(itemName) {
    const deps = dependsOn.get(itemName) || [];
    const ingredientsSatisfied = deps.every(dep => placed.has(dep) || !craftsByName.has(dep));

    if (!ingredientsSatisfied) return false;

    const craft = craftsByName.get(itemName);
    if (craft.requiresTable && craftsByName.has('crafting_table') && !placed.has('crafting_table')) {
      return false;
    }

    return true;
  }

  while (remaining.size > 0) {
    let progressed = false;

    for (const itemName of [...remaining]) {
      if (!dependenciesSatisfied(itemName)) continue;

      orderedCrafts.push(craftsByName.get(itemName));
      placed.add(itemName);
      remaining.delete(itemName);
      progressed = true;
    }

    if (!progressed) {
      // Zyklus oder unauflösbare Abhängigkeit: restliche Items in
      // beliebiger Reihenfolge anhängen, statt zu blockieren.
      for (const itemName of remaining) {
        orderedCrafts.push(craftsByName.get(itemName));
        warnings.push({ reason: 'dependency_cycle', name: itemName });
      }
      break;
    }
  }

  return {
    success: true,
    targets: targetEntries,
    alreadyAvailable,
    missingTargets,
    baseMaterialsNeeded,
    baseMaterialsMissing,
    orderedCrafts,
    requiresCraftingTable,
    selectedMaterialGroup: woodPackage.planksName.replace('_planks', ''),
    selectedWoodPackage: woodPackage,
    warnings
  };
}

module.exports = { checkRecipePlan };