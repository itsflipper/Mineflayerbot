const { smartCraft } = require('../crafting/smartCraft');
const { hasItem } = require('../utils/inventory');
const woodenTools = require('./woodenTools');
const { STATUS } = require('./taskRunner');

const TARGETS = [
  { name: 'stone_sword', count: 1 },
  { name: 'stone_axe', count: 1 },
  { name: 'stone_pickaxe', count: 1 },
  { name: 'stone_shovel', count: 1 }
];

async function ensureWoodenPickaxe(bot) {
  if (hasItem(bot, 'wooden_pickaxe')) return { success: true };

  const status = await woodenTools.run(bot);

  return status === STATUS.SUCCESS
    ? { success: true }
    : { success: false };
}

async function run(bot) {
  const requirement = await ensureWoodenPickaxe(bot);
  if (!requirement.success) return STATUS.FAILURE;

  const result = await smartCraft(bot, TARGETS);

  if (!result.success) {
    console.log('[stoneTools] smartCraft failed:', JSON.stringify(result, null, 2));
    return STATUS.FAILURE;
  }

  return STATUS.SUCCESS;
}

module.exports = { run };