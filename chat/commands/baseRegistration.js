const config = require('../../config');
const { addBase, getBases, removeBase } = require('../../memory/worldMemory');
const { isNumeric, toPlainPosition, toBlockArea, formatPosition } = require('../../utils/position');

const pendingCornersByUser = new Map();
const awaitingNameByUser = new Map();

const BASE_USAGE = 'Usage: !rb start [player|x y z] | end [player|x y z] | cancel | list | remove <name>';
const POSITION_NOT_FOUND = 'Could not resolve a position. Provide a player name, "x y z", or stand close to the bot.';

function getPlayerPosition(bot, playerName) {
  return bot.players[playerName]?.entity?.position || null;
}

function getCoordinatePosition(args) {
  if (args.length !== 3) return null;
  if (!args.every(isNumeric)) return null;

  const [x, y, z] = args.map(Number);
  return { x, y, z };
}

function resolvePosition(bot, username, args) {
  if (args.length === 0) return getPlayerPosition(bot, username);

  const coordinatePosition = getCoordinatePosition(args);
  if (coordinatePosition) return coordinatePosition;

  if (args.length === 1) return getPlayerPosition(bot, args[0]);

  return null;
}

function setAwaitingName(username, area) {
  awaitingNameByUser.set(username, area);
}

function isNameTaken(result) {
  return !result.success && result.reason === 'name_taken';
}

function replyPositionNotFound(reply) {
  reply(POSITION_NOT_FOUND);
}

function replyBaseUsage(reply) {
  reply(BASE_USAGE);
}

function replyNameTaken(reply, name) {
  reply(`A base named "${name}" already exists. What should the base be called instead?`);
}

function replyBaseSaved(reply, name, min, max) {
  reply(`Base "${name}" saved: ${JSON.stringify(min)} to ${JSON.stringify(max)}`);
}

function replyCornerSet(reply, position) {
  reply(`Corner 1 set (${formatPosition(position)}). Go to the opposite corner and type "!rb end".`);
}

function finishRegistration(username, name, min, max, reply) {
  const result = addBase(config.worldId, { name, min, max });

  if (isNameTaken(result)) {
    setAwaitingName(username, { min, max });
    replyNameTaken(reply, name);
    return;
  }

  replyBaseSaved(reply, name, min, max);
}

function startRegistration({ bot, username, args, reply }) {
  const position = resolvePosition(bot, username, args);

  if (!position) {
    replyPositionNotFound(reply);
    return;
  }

  pendingCornersByUser.set(username, toPlainPosition(position));
  replyCornerSet(reply, position);
}

function endRegistration({ bot, username, args, reply }) {
  const corner1 = pendingCornersByUser.get(username);

  if (!corner1) {
    reply('No registration is open. Start with "!rb start".');
    return;
  }

  const position = resolvePosition(bot, username, args);

  if (!position) {
    replyPositionNotFound(reply);
    return;
  }

  const area = toBlockArea(corner1, position);
  pendingCornersByUser.delete(username);
  setAwaitingName(username, area);
  reply('What should the base be called? Type only the name in chat.');
}

function hasPendingNameRequest(username) {
  return awaitingNameByUser.has(username);
}

function resolvePendingName(username, message, reply) {
  const pending = awaitingNameByUser.get(username);
  const name = message.trim();

  if (!name) {
    reply('Please enter a name.');
    return;
  }

  awaitingNameByUser.delete(username);
  finishRegistration(username, name, pending.min, pending.max, reply);
}

function cancelRegistration({ username, reply }) {
  const hadPending = pendingCornersByUser.delete(username);
  const hadAwaitingName = awaitingNameByUser.delete(username);

  if (hadPending || hadAwaitingName) {
    reply('Registration cancelled.');
    return;
  }

  reply('No registration is open.');
}

function getBaseNames() {
  return getBases(config.worldId).map(base => base.name);
}

function listBases({ reply }) {
  const baseNames = getBaseNames();

  if (baseNames.length === 0) {
    reply('No protected bases are registered.');
    return;
  }

  reply(`Protected bases: ${baseNames.join(', ')}`);
}

function removeBaseCommand({ args, reply }) {
  const name = args[0];

  if (!name) {
    reply('Usage: !rb remove <name>');
    return;
  }

  const result = removeBase(config.worldId, name);

  if (result.success) {
    reply(`Base "${name}" removed.`);
    return;
  }

  reply(`No base named "${name}" was found.`);
}

const subcommands = {
  start: startRegistration,
  end: endRegistration,
  cancel: cancelRegistration,
  list: listBases,
  ls: listBases,
  remove: removeBaseCommand,
  delete: removeBaseCommand,
  del: removeBaseCommand
};

function getSubcommandName(args) {
  return args[0]?.toLowerCase() || null;
}

function getSubcommandArgs(args) {
  return args.slice(1);
}

async function run(context) {
  const { args, reply } = context;
  const subcommand = subcommands[getSubcommandName(args)];

  if (!subcommand) {
    replyBaseUsage(reply);
    return;
  }

  return subcommand({ ...context, args: getSubcommandArgs(args) });
}

const commands = {
  registerbase: {
    description: 'Registers a protected base area with start, end, cancel, list, and remove.',
    aliases: ['rb'],
    run
  }
};

module.exports = { commands, hasPendingNameRequest, resolvePendingName };