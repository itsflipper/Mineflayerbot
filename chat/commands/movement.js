const config = require('../../config');
const { resolveTargetPosition } = require('./shared/locate');
const { goalNear, goalFollow, stopPathfinder } = require('../../actions/navigation');
const { REPLIES } = require('../replies');

const followingUsers = new Set();

function getGotoPosition(bot, args) {
  return resolveTargetPosition(bot, config.worldId, args);
}

function getPlayerEntity(bot, username) {
  return bot.players[username]?.entity || null;
}

function stopFollowing(username) {
  return followingUsers.delete(username);
}

function startFollowing(bot, username, entity) {
  followingUsers.add(username);
  bot.pathfinder.setGoal(goalFollow(entity, 2), true);
}

async function runGotoCommand({ bot, username, args, reply }) {
  const position = getGotoPosition(bot, args);

  if (!position) {
    reply(REPLIES.gotoUsage);
    return;
  }

  stopFollowing(username);
  await bot.pathfinder.goto(goalNear(position, 1));
}

async function runToggleFollowCommand({ bot, username, reply }) {
  if (stopFollowing(username)) {
    await stopPathfinder(bot);
    reply(REPLIES.followDisabled);
    return;
  }

  const entity = getPlayerEntity(bot, username);

  if (!entity) {
    reply(REPLIES.playerNotFound);
    return;
  }

  startFollowing(bot, username, entity);
  reply(REPLIES.followEnabled);
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