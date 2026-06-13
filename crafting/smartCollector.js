const { collectNearbyLog } = require('../actions/collecting/collectWood');
const { collectNearbyStone } = require('../actions/collecting/collectStone');
const { LOG_NAMES } = require('../data/items/woodTypes');
const { COBBLESTONE_NAMES } = require('../data/items/stoneTypes');

const DEFAULT_COLLECT_OPTIONS = {
  maxDistance: 32,
  attempts: 5
};

function getPreferredLogName(recipePlan) {
  return recipePlan.selectedWoodPackage ? recipePlan.selectedWoodPackage.logName : null;
}

// Schnittstelle jedes Collectors: (bot, entry, options) -> { success, count, ... }
//
// entry.needed ist der GESAMTbedarf laut Plan (available_at_plan_time + missing).
// Hier NICHT countLogs(bot) + entry.missing verwenden - das würde den zum
// Plan-Zeitpunkt bereits vorhandenen Bestand nochmal draufaddieren, falls
// sich der Log-Bestand zwischen Planung und Sammeln geändert hat.
async function collectLogEntry(bot, entry, options) {
  const result = await collectNearbyLog(bot, {
    minLogCount: entry.needed,
    preferredLogName: options.preferredLogName,
    maxDistance: options.maxDistance,
    attempts: options.attempts
  });

  return { ...result, count: result.logCount };
}

// Gleiches Prinzip wie collectLogEntry, nur für Cobblestone. Ein fehlender
// Pickaxe (collectResult.reason === 'no_pickaxe') ist hier ein ganz normaler
// Collect-Fehler aus Sicht des Registries - die Task hat das vorher bereits
// geprüft (siehe stoneTools.js).
async function collectStoneEntry(bot, entry, options) {
  const result = await collectNearbyStone(bot, {
    minCobblestoneCount: entry.needed,
    maxDistance: options.maxDistance,
    attempts: options.attempts
  });

  return { ...result, count: result.cobblestoneCount };
}

// Collector-Registry: Materialname -> collect-Funktion. Alle austauschbaren
// Varianten eines Materials (alle Logsorten, alle Cobblestone-Sorten) zeigen
// auf denselben Collector.
function buildCollectorsFor(itemNames, collectorFn) {
  const collectors = {};

  for (const itemName of itemNames) {
    collectors[itemName] = collectorFn;
  }

  return collectors;
}

const COLLECTORS = {
  ...buildCollectorsFor(LOG_NAMES, collectLogEntry),
  ...buildCollectorsFor(COBBLESTONE_NAMES, collectStoneEntry)
};

function createCollectedEntry(entry, collectResult) {
  return {
    name: entry.name,
    requested: entry.missing,
    countAfter: collectResult.count
  };
}

function createMissingEntry(entry, collectResult) {
  return {
    name: entry.name,
    missing: entry.missing,
    collectResult
  };
}

function createUnsupportedEntry(entry) {
  return {
    name: entry.name,
    missing: entry.missing,
    reason: 'unsupported_base_material'
  };
}

// Schaut in der Registry nach, welcher Collector für entry.name zuständig
// ist, und feuert ihn. Gibt einheitlich {handled, success, result} zurück,
// damit der Aufrufer (collectMissingBaseMaterials) flach bleibt.
async function collectEntry(bot, entry, options) {
  const collector = COLLECTORS[entry.name];

  if (!collector) {
    return { handled: false, success: false, result: createUnsupportedEntry(entry) };
  }

  const collectResult = await collector(bot, entry, options);

  if (!collectResult.success) {
    return { handled: true, success: false, result: createMissingEntry(entry, collectResult) };
  }

  return { handled: true, success: true, result: createCollectedEntry(entry, collectResult) };
}

async function collectMissingBaseMaterials(bot, recipePlan, options = {}) {
  const collectOptions = {
    ...DEFAULT_COLLECT_OPTIONS,
    ...options,
    preferredLogName: getPreferredLogName(recipePlan)
  };

  const collected = [];
  const stillMissing = [];
  const errors = [];

  for (const entry of recipePlan.baseMaterialsMissing) {
    const outcome = await collectEntry(bot, entry, collectOptions);

    if (outcome.success) {
      collected.push(outcome.result);
      continue;
    }

    stillMissing.push(entry);
    errors.push(outcome.result);
  }

  return {
    success: errors.length === 0,
    collected,
    stillMissing,
    errors
  };
}

module.exports = { collectMissingBaseMaterials };