function getItems(bot) {
  return bot.inventory.items();
}

function findItem(bot, itemName) {
  return getItems(bot).find(item => item.name === itemName) || null;
}

function findFirstByNames(bot, itemNames) {
  return getItems(bot).find(item => itemNames.includes(item.name)) || null;
}

function hasItem(bot, itemName) {
  return Boolean(findItem(bot, itemName));
}

function countByPredicate(bot, predicate) {
  return getItems(bot)
    .filter(predicate)
    .reduce((sum, item) => sum + item.count, 0);
}

function countItem(bot, itemName) {
  return countByPredicate(bot, item => item.name === itemName);
}

function countByNames(bot, itemNames) {
  return countByPredicate(bot, item => itemNames.includes(item.name));
}

function missingCount(bot, itemName, targetCount) {
  return Math.max(0, targetCount - countItem(bot, itemName));
}

function hasAtLeast(bot, itemName, count) {
  return countItem(bot, itemName) >= count;
}

module.exports = {
  getItems,
  findItem,
  findFirstByNames,
  hasItem,
  countByPredicate,
  countItem,
  countByNames,
  missingCount,
  hasAtLeast
};