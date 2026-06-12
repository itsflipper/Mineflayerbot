const { goals } = require('mineflayer-pathfinder');
const config = require('../../config');
const { resolveTargetPosition } = require('./shared/locate');

const followingUsers = new Set();

function getGotoPosition(bot, args) {
  return resolveTargetPosition(bot, config.worldId, args);
}

function createGotoGoal(position) {
  return new goals.GoalNear(position.x, position.y, position.z, 1);
}

function createFollowGoal(entity) {
  return new goals.GoalFollow(entity, 2);
}

function getPlayerEntity(bot, username) {
  return bot.players[username]?.entity || null;
}

function stopFollowing(username) {
  return followingUsers.delete(username);
}

function stopPathfinder(bot) {
  bot.pathfinder.setGoal(null);
}

function startFollowing(bot, username, entity) {
  followingUsers.add(username);
  bot.pathfinder.setGoal(createFollowGoal(entity), true);
}

function replyGotoUsage(reply) {
  reply('Usage: !goto <player> | <baseName> | <x> <y> <z>');
}

function replyPlayerNotFound(reply) {
  reply('I could not find you. Move closer to the bot.');
}

function replyFollowEnabled(reply) {
  reply('Follow mode enabled.');
}

function replyFollowDisabled(reply) {
  reply('Follow mode disabled.');
}

async function runGotoCommand({ bot, username, args, reply }) {
  const position = getGotoPosition(bot, args);

  if (!position) {
    replyGotoUsage(reply);
    return;
  }

  stopFollowing(username);
  await bot.pathfinder.goto(createGotoGoal(position));
}

async function runToggleFollowCommand({ bot, username, reply }) {
  if (stopFollowing(username)) {
    stopPathfinder(bot);
    replyFollowDisabled(reply);
    return;
  }

  const entity = getPlayerEntity(bot, username);

  if (!entity) {
    replyPlayerNotFound(reply);
    return;
  }

  startFollowing(bot, username, entity);
  replyFollowEnabled(reply);
}

const commands = {
  goto: {
    description: 'Goes to a player, base, or coordinates.',
    aliases: ['g'],
    run: runGotoCommand
  },
  togglefollow: {
    description: 'Toggles follow mode for you.',
    aliases: ['tf'],
    run: runToggleFollowCommand
  }
};

module.exports = { commands };