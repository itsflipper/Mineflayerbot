const { countByNames, countItem } = require('../../utils/inventory');

const STONE_NAMES = ['stone', 'deepslate'];

const COBBLESTONE_NAMES = ['cobblestone', 'cobbled_deepslate'];

// Anders als bei Holz (planksNameForLog via einfachem Suffix-Replace) folgen
// Stone -> Cobblestone keiner einheitlichen Namens-Konvention, daher eine
// explizite Zuordnungstabelle.
const COBBLESTONE_NAME_FOR_STONE = {
  stone: 'cobblestone',
  deepslate: 'cobbled_deepslate'
};

const STONE_NAME_FOR_COBBLESTONE = {
  cobblestone: 'stone',
  cobbled_deepslate: 'deepslate'
};

function cobblestoneNameForStone(stoneName) {
  return COBBLESTONE_NAME_FOR_STONE[stoneName] || 'cobblestone';
}

function stoneNameForCobblestone(cobblestoneName) {
  return STONE_NAME_FOR_COBBLESTONE[cobblestoneName] || 'stone';
}

function isStoneName(itemName) {
  return STONE_NAMES.includes(itemName);
}

function isCobblestoneName(itemName) {
  return COBBLESTONE_NAMES.includes(itemName);
}

function countCobblestone(bot) {
  return countByNames(bot, COBBLESTONE_NAMES);
}

function countCobblestoneOfType(bot, cobblestoneName) {
  return countItem(bot, cobblestoneName);
}

module.exports = {
  STONE_NAMES,
  COBBLESTONE_NAMES,
  cobblestoneNameForStone,
  stoneNameForCobblestone,
  isStoneName,
  isCobblestoneName,
  countCobblestone,
  countCobblestoneOfType
};