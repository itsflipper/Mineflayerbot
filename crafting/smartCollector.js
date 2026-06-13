const { collectNearbyLog } = require('../actions/collectWood');
const { countLogs, isLogName } = require('../actions/woodTypes');

const DEFAULT_COLLECT_OPTIONS = {
  maxDistance: 32,
  attempts: 5
};

function getPreferredLogName(recipePlan) {
  return recipePlan.selectedWoodPackage ? recipePlan.selectedWoodPackage.logName : null;
}

function createCollectedEntry(entry, collectResult) {
  return {
    name: entry.name,
    requested: entry.missing,
    logCountAfter: collectResult.logCount
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

async function collectLogEntry(bot, entry, preferredLogName, collectOptions) {
  const targetLogCount = countLogs(bot) + entry.missing;

  return collectNearbyLog(bot, {
    minLogCount: targetLogCount,
    preferredLogName,
    maxDistance: collectOptions.maxDistance,
    attempts: collectOptions.attempts
  });
}

async function collectMissingBaseMaterials(bot, recipePlan, options = {}) {
  const collectOptions = { ...DEFAULT_COLLECT_OPTIONS, ...options };
  const preferredLogName = getPreferredLogName(recipePlan);

  const collected = [];
  const stillMissing = [];
  const errors = [];

  for (const entry of recipePlan.baseMaterialsMissing) {
    if (!isLogName(entry.name)) {
      stillMissing.push(entry);
      errors.push(createUnsupportedEntry(entry));
      continue;
    }

    const collectResult = await collectLogEntry(bot, entry, preferredLogName, collectOptions);

    if (collectResult.success) {
      collected.push(createCollectedEntry(entry, collectResult));
      continue;
    }

    stillMissing.push(entry);
    errors.push(createMissingEntry(entry, collectResult));
  }

  return {
    success: errors.length === 0,
    collected,
    stillMissing,
    errors
  };
}

module.exports = { collectMissingBaseMaterials };