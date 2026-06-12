const config = require('../config');

const botState = {
  isSpawned: false,
  lifeState: 'unspawned', // unspawned | alive | dead_recently
  lastDeathPosition: null,
  inventoryEmpty: true,
  currentTask: null,
  activeWorldId: config.worldId
};

function handleSpawn(bot) {
  botState.isSpawned = true;
  botState.lifeState = 'alive';
  botState.inventoryEmpty = bot.inventory.items().length === 0;
}

function handleDeath(bot) {
  const pos = bot.entity.position;
  botState.lastDeathPosition = { x: pos.x, y: pos.y, z: pos.z };
  botState.lifeState = 'dead_recently';
}

module.exports = { botState, handleSpawn, handleDeath };