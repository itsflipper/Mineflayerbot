const LOG_NAMES = [
  'oak_log', 'birch_log', 'spruce_log',
  'jungle_log', 'acacia_log', 'dark_oak_log',
  'mangrove_log', 'cherry_log'
];

const PLANK_NAMES = LOG_NAMES.map(planksNameForLog);

function planksNameForLog(logName) {
  return logName.replace('_log', '_planks');
}

function logNameForPlanks(planksName) {
  return planksName.replace('_planks', '_log');
}

function isLogName(itemName) {
  return LOG_NAMES.includes(itemName);
}

function isPlanksName(itemName) {
  return PLANK_NAMES.includes(itemName);
}

module.exports = {
  LOG_NAMES,
  PLANK_NAMES,
  planksNameForLog,
  logNameForPlanks,
  isLogName,
  isPlanksName
};