const { smartCraft } = require('../crafting/smartCraft');
const { STATUS } = require('./taskRunner');

const TARGETS = [
  { name: 'wooden_pickaxe', count: 1 },
  { name: 'wooden_axe', count: 1 }
];

async function run(bot) {
  const result = await smartCraft(bot, TARGETS);

  return result.success ? STATUS.SUCCESS : STATUS.FAILURE;
}

module.exports = { run };