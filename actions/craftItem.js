const mcDataLoader = require('minecraft-data');

function findRecipe(bot, itemName, craftingTable) {
  const mcData = mcDataLoader(bot.version);
  const item = mcData.itemsByName[itemName];
  if (!item) return null;

  const recipes = bot.recipesFor(item.id, null, 1, craftingTable);
  return recipes[0] || null;
}

async function craftItem(bot, itemName, amount, craftingTable = null) {
  const recipe = findRecipe(bot, itemName, craftingTable);
  if (!recipe) return { success: false, reason: 'no_recipe' };

  await bot.craft(recipe, amount, craftingTable);
  return { success: true };
}

module.exports = { craftItem };