const { findBaseByName } = require('../../../memory/worldMemory');

function isNumeric(value) {
  return value !== undefined && value !== '' && !Number.isNaN(Number(value));
}

function getPlayerPosition(bot, playerName) {
  const player = bot.players[playerName];
  if (!player || !player.entity) return null;
  return player.entity.position;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function nearestPointInBase(bot, base) {
  const pos = bot.entity.position;
  return {
    x: clamp(pos.x, base.min.x, base.max.x),
    y: clamp(pos.y, base.min.y, base.max.y),
    z: clamp(pos.z, base.min.z, base.max.z)
  };
}

function resolveTargetPosition(bot, worldId, args) {
  if (args.length === 3 && args.every(isNumeric)) {
    const [x, y, z] = args.map(Number);
    return { x, y, z };
  }

  if (args.length === 1) {
    const playerPosition = getPlayerPosition(bot, args[0]);
    if (playerPosition) return playerPosition;

    const base = findBaseByName(worldId, args[0]);
    if (base) return nearestPointInBase(bot, base);
  }

  return null;
}

module.exports = { resolveTargetPosition, getPlayerPosition };