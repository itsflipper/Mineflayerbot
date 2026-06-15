const { Movements } = require('mineflayer-pathfinder');
const { getProfile } = require('./movementProfiles');
const { canDig, canPlace } = require('./profileSelector');
const config = require('../../config');

function applyBaseProtection(movements) {
  movements.exclusionAreasBreak.push((block) => {
    if (!canDig(config.worldId, block.position)) return 100;
    return 0;
  });

  movements.exclusionAreasPlace.push((block) => {
    if (!canPlace(config.worldId, block.position)) return 100;
    return 0;
  });
}

function applyNoPlace(movements) {
  movements.scafoldingBlocks = [];
  movements.exclusionAreasPlace.push(() => 100);
}

function createMovements(bot, profileName) {
  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  const profile = getProfile(profileName);

  movements.canDig = profile.canDig;
  movements.canOpenDoors = false;

  if (!profile.canPlace) applyNoPlace(movements);

  applyBaseProtection(movements);

  return movements;
}

module.exports = { createMovements };