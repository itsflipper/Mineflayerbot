const { Vec3 } = require('vec3');

function isNumeric(value) {
  return value !== undefined && value !== '' && !Number.isNaN(Number(value));
}

function formatPosition(position) {
  return `x=${position.x.toFixed(2)}, y=${position.y.toFixed(2)}, z=${position.z.toFixed(2)}`;
}

function toPlainPosition(position) {
  return { x: position.x, y: position.y, z: position.z };
}

function toBlockPosition(position) {
  return toPlainPosition(position.floored());
}

function toVec3(position) {
  return new Vec3(position.x, position.y, position.z);
}

function toBlockArea(posA, posB) {
  return {
    min: {
      x: Math.floor(Math.min(posA.x, posB.x)),
      y: Math.floor(Math.min(posA.y, posB.y)),
      z: Math.floor(Math.min(posA.z, posB.z))
    },
    max: {
      x: Math.ceil(Math.max(posA.x, posB.x)),
      y: Math.ceil(Math.max(posA.y, posB.y)),
      z: Math.ceil(Math.max(posA.z, posB.z))
    }
  };
}

function sameBlockPosition(a, b) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

module.exports = {
  isNumeric,
  formatPosition,
  toPlainPosition,
  toBlockPosition,
  toVec3,
  toBlockArea,
  sameBlockPosition
};