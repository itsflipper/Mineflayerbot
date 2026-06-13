const { countByNames, countItem, findFirstByNames } = require('../../utils/inventory');

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

function countLogs(bot) {
  return countByNames(bot, LOG_NAMES);
}

function countPlanks(bot) {
  return countByNames(bot, PLANK_NAMES);
}

function countLogsOfType(bot, logName) {
  return countItem(bot, logName);
}

function countPlanksOfType(bot, planksName) {
  return countItem(bot, planksName);
}

function countVirtualPlanksOfType(bot, planksName) {
  const logName = logNameForPlanks(planksName);
  return countPlanksOfType(bot, planksName) + countLogsOfType(bot, logName) * 4;
}

function findLogItem(bot) {
  return findFirstByNames(bot, LOG_NAMES);
}

module.exports = {
  LOG_NAMES,
  PLANK_NAMES,
  planksNameForLog,
  logNameForPlanks,
  isLogName,
  isPlanksName,
  countLogs,
  countPlanks,
  countLogsOfType,
  countPlanksOfType,
  countVirtualPlanksOfType,
  findLogItem
};