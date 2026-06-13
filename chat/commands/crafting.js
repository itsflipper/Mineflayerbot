const { checkRecipePlan } = require('../../crafting/checkRecipes');
const { smartCraft } = require('../../crafting/smartCraft');

// Bekannte Task-Targets für Debug-Zwecke. Jeder Eintrag entspricht den
// TARGETS, die die jeweilige Task an smartCraft übergeben würde.
const TASK_TARGETS = {
  woodentools: [
    { name: 'wooden_pickaxe', count: 1 },
    { name: 'wooden_axe', count: 1 }
  ],
  stonetools: [
    { name: 'stone_sword', count: 1 },
    { name: 'stone_axe', count: 1 },
    { name: 'stone_pickaxe', count: 1 },
    { name: 'stone_shovel', count: 1 }
  ]
};

const USAGE = `Usage: !cr/!sc <taskName> - available: ${Object.keys(TASK_TARGETS).join(', ')}`;

function resolveTargets(args) {
  const taskName = args[0]?.toLowerCase();
  return TASK_TARGETS[taskName] || null;
}

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
    `orderedCrafts: ${formatList(plan.orderedCrafts, formatCraftEntry)}`,
    `warnings: ${formatList(plan.warnings, formatWarningEntry)}`
  ];
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

async function runCheckRecipesCommand({ bot, args, reply }) {
  const targets = resolveTargets(args);

  if (!targets) {
    reply(USAGE);
    return;
  }

  const plan = checkRecipePlan(bot, targets);

  console.log('[checkRecipePlan]', JSON.stringify(plan, null, 2));

  reply(buildSummaryLines(plan).join(' | '));
}

async function runSmartCraftCommand({ bot, args, reply }) {
  const targets = resolveTargets(args);

  if (!targets) {
    reply(USAGE);
    return;
  }

  const result = await smartCraft(bot, targets);

  console.log('[smartCraft]', JSON.stringify(result, null, 2));

  reply(buildSmartCraftSummary(result));
}

const commands = {
  checkrecipes: {
    description: 'Debug: shows the recipe plan for a known task target set (e.g. !cr woodentools).',
    aliases: ['cr'],
    run: runCheckRecipesCommand
  },
  smartcraft: {
    description: 'Debug: runs the smart crafting pipeline for a known task target set (e.g. !sc woodentools).',
    aliases: ['sc'],
    run: runSmartCraftCommand
  }
};

module.exports = { commands };