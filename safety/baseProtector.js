const { getBases } = require('../memory/worldMemory');

function isInsideBox(position, base) {
  const insideX = position.x >= base.min.x && position.x <= base.max.x;
  const insideY = position.y >= base.min.y && position.y <= base.max.y;
  const insideZ = position.z >= base.min.z && position.z <= base.max.z;
  return insideX && insideY && insideZ;
}

function isInsideProtectedArea(worldId, position) {
  const bases = getBases(worldId);
  return bases.some(base => isInsideBox(position, base));
}

function canDig(worldId, position) {
  return !isInsideProtectedArea(worldId, position);
}

function canPlace(worldId, position) {
  return !isInsideProtectedArea(worldId, position);
}

module.exports = { isInsideProtectedArea, canDig, canPlace };