const taskRunner = require('../../tasks/taskRunner');
const recoverDeathItems = require('../../tasks/recoverDeathItems');
const craftPlaceCraftingTable = require('../../tasks/craftPlaceCraftingTable');
const woodenTools = require('../../tasks/woodenTools');
const stoneTools = require('../../tasks/stoneTools');
const { REPLIES } = require('../replies');

const TASKS = {
  recoverdeathitems: recoverDeathItems,
  craftplacecraftingtable: craftPlaceCraftingTable,
  woodentools: woodenTools,
  stonetools: stoneTools
};

function getTaskName(args) {
  return args[0]?.toLowerCase() || null;
}

function getTask(taskName) {
  if (!taskName) return null;
  return TASKS[taskName] || null;
}

function getAvailableTasksText() {
  return Object.keys(TASKS).join(', ');
}

function isFailure(status) {
  return status === taskRunner.STATUS.FAILURE;
}

async function runTask(bot, task) {
  taskRunner.start(task);
  return taskRunner.tick(bot);
}

async function runTaskCommand({ bot, args, reply }) {
  const taskName = getTaskName(args);
  const task = getTask(taskName);

  if (!task) {
    reply(REPLIES.unknownTask(getAvailableTasksText()));
    return;
  }

  const status = await runTask(bot, task);

  if (isFailure(status)) {
    reply(REPLIES.taskFailed(taskName));
  }
}

const commands = {
  task: {
    description: 'Starts a task manually.',
    aliases: ['t'],
    run: runTaskCommand
  }
};

module.exports = { commands };