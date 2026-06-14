const { Movements } = require('mineflayer-pathfinder');

function installPathing(bot) {
  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  bot.pathfinder.setMovements(movements);
}

async function pathfinderGoto(bot, goal) {
  await bot.pathfinder.goto(goal);
}

function pathfinderSetGoal(bot, goal, dynamic = false) {
  bot.pathfinder.setGoal(goal, dynamic);
}

function pathfinderSetMovements(bot, movements) {
  bot.pathfinder.setMovements(movements);
}

function pathfinderStop(bot) {
  bot.pathfinder.setGoal(null);
}

module.exports = {
  installPathing,
  pathfinderGoto,
  pathfinderSetGoal,
  pathfinderSetMovements,
  pathfinderStop
};