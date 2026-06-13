const { checkRecipePlan } = require('../../crafting/checkRecipes');
const { smartCraft } = require('../../crafting/smartCraft');

const DEBUG_TARGETS = [
  { name: 'wooden_pickaxe', count: 1 },
  { name: 'wooden_axe', count: 1 }
];

function formatList(items, formatEntry) {
  if (items.length === 0) return 'none';
  return items.map(formatEntry).join(', ');
}

function formatTargetEntry(entry) {
  return `${entry.name}x${entry.missing ?? entry.available}`;
}

function formatCraftEntry(entry) {
  return `${entry.name} craft${entry.craftsNeeded}->${entry.producesCount} (have ${entry.available}/${entry.needed})`;
}

function formatBaseMaterialEntry(entry) {
  return `${entry.name}x${entry.missing}`;
}

function formatWarningEntry(warning) {
  return `${warning.reason}:${warning.name}`;
}

function buildSummaryLines(plan) {
  return [
    `success=${plan.success} table=${plan.requiresCraftingTable} woodGroup=${plan.selectedMaterialGroup}`,
    `alreadyAvailable: ${formatList(plan.alreadyAvailable, formatTargetEntry)}`,
    `missingTargets: ${formatList(plan.missingTargets, formatTargetEntry)}`,
    `baseMaterialsMissing: ${formatList(plan.baseMaterialsMissing, formatBaseMaterialEntry)}`,
    `intermediateCrafts: ${formatList(plan.intermediateCrafts, formatCraftEntry)}`,
    `finalCrafts: ${formatList(plan.finalCrafts, formatCraftEntry)}`,
    `warnings: ${formatList(plan.warnings, formatWarningEntry)}`
  ];
}

async function runCheckRecipesCommand({ bot, reply }) {
  const plan = checkRecipePlan(bot, DEBUG_TARGETS);

  console.log('[checkRecipePlan]', JSON.stringify(plan, null, 2));

  reply(buildSummaryLines(plan).join(' | '));
}

function formatCraftedList(crafted) {
  if (crafted.length === 0) return 'none';
  return crafted.join(', ');
}

function formatSmartCraftWarning(warning) {
  return warning.reason;
}

function buildSmartCraftSummary(result) {
  if (!result.success) {
    return `success=false reason=${result.reason}`;
  }

  return [
    'success=true',
    `crafted: ${formatCraftedList(result.crafted)}`,
    `warnings: ${formatList(result.warnings, formatSmartCraftWarning)}`
  ].join(' | ');
}

async function runSmartCraftCommand({ bot, reply }) {
  const result = await smartCraft(bot, DEBUG_TARGETS);

  console.log('[smartCraft]', JSON.stringify(result, null, 2));

  reply(buildSmartCraftSummary(result));
}

const commands = {
  checkrecipes: {
    description: 'Debug: shows the recipe plan for wooden_pickaxe + wooden_axe.',
    aliases: ['cr'],
    run: runCheckRecipesCommand
  },
  smartcraft: {
    description: 'Debug: runs the smart crafting pipeline for wooden_pickaxe + wooden_axe.',
    aliases: ['sc'],
    run: runSmartCraftCommand
  }
};

module.exports = { commands };