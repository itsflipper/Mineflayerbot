const fs = require('fs');
const path = require('path');

const WORLDS_DIR = path.join(__dirname, '..', 'data', 'worlds');

function ensureWorldsDir() {
  if (fs.existsSync(WORLDS_DIR)) return;
  fs.mkdirSync(WORLDS_DIR, { recursive: true });
}

function getWorldFilePath(worldId) {
  return path.join(WORLDS_DIR, `${worldId}.json`);
}

function loadWorldData(worldId) {
  ensureWorldsDir();
  const filePath = getWorldFilePath(worldId);

  if (!fs.existsSync(filePath)) {
    return { worldId, bases: [] };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function saveWorldData(worldId, data) {
  ensureWorldsDir();
  const filePath = getWorldFilePath(worldId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getBases(worldId) {
  return loadWorldData(worldId).bases;
}

function findBaseByName(worldId, name) {
  const bases = getBases(worldId);
  return bases.find(base => base.name.toLowerCase() === name.toLowerCase()) || null;
}

function addBase(worldId, base) {
  const data = loadWorldData(worldId);

  const alreadyExists = data.bases.some(b => b.name.toLowerCase() === base.name.toLowerCase());
  if (alreadyExists) return { success: false, reason: 'name_taken' };

  data.bases.push(base);
  saveWorldData(worldId, data);
  return { success: true };
}

function removeBase(worldId, name) {
  const data = loadWorldData(worldId);
  const before = data.bases.length;

  data.bases = data.bases.filter(b => b.name.toLowerCase() !== name.toLowerCase());
  if (data.bases.length === before) return { success: false, reason: 'not_found' };

  saveWorldData(worldId, data);
  return { success: true };
}

module.exports = {
  getBases,
  findBaseByName,
  addBase,
  removeBase
};