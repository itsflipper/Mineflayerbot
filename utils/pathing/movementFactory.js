const { Movements } = require('mineflayer-pathfinder');
const { getProfile } = require('./movementProfiles');

function applyCanPlace(movements) {
  movements.scafoldingBlocks = [];
  movements.exclusionAreasPlace.push(() => 100);
}

function createMovements(bot, profileName) {
  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  const profile = getProfile(profileName);

  movements.canDig = profile.canDig;

  if (!profile.canPlace) applyCanPlace(movements);

  return movements;
}

module.exports = { createMovements };