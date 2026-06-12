const { getItems } = require('../../utils/inventory');

function hasNoItems(items) {
  return items.length === 0;
}

function formatInventoryItem(item) {
  return `${item.name} x${item.count}`;
}

function formatInventoryItems(items) {
  return items.map(formatInventoryItem).join(', ');
}

function summarizeInventory(bot) {
  const items = getItems(bot);

  if (hasNoItems(items)) {
    return 'Inventory is empty.';
  }

  return formatInventoryItems(items);
}

async function runInventoryCommand({ bot, reply }) {
  reply(summarizeInventory(bot));
}

const commands = {
  inventory: {
    description: "Shows the bot's inventory.",
    aliases: ['inv'],
    run: runInventoryCommand
  }
};

module.exports = { commands };