const config = require('../../config');
const { addBase, getBases, removeBase } = require('../../memory/worldMemory');
const { isNumeric, toPlainPosition, toBlockArea } = require('../../utils/position');
const { REPLIES } = require('../replies');

const pendingCornersByUser = new Map();
const awaitingNameByUser = new Map();

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

function finishRegistration(username, name, min, max, reply) {
  const result = addBase(config.worldId, { name, min, max });

  if (isNameTaken(result)) {
    setAwaitingName(username, { min, max });
    reply(REPLIES.nameTaken(name));
    return;
  }

  reply(REPLIES.baseSaved(name, min, max));
}

function startRegistration({ bot, username, args, reply }) {
  const position = resolvePosition(bot, username, args);

  if (!position) {
    reply(REPLIES.positionNotFound);
    return;
  }

  pendingCornersByUser.set(username, toPlainPosition(position));
  reply(REPLIES.cornerSet(position));
}

function endRegistration({ bot, username, args, reply }) {
  const corner1 = pendingCornersByUser.get(username);

  if (!corner1) {
    reply(REPLIES.noRegistrationOpenStart);
    return;
  }

  const position = resolvePosition(bot, username, args);

  if (!position) {
    reply(REPLIES.positionNotFound);
    return;
  }

  const area = toBlockArea(corner1, position);
  pendingCornersByUser.delete(username);
  setAwaitingName(username, area);
  reply(REPLIES.askBaseName);
}

function hasPendingNameRequest(username) {
  return awaitingNameByUser.has(username);
}

function resolvePendingName(username, message, reply) {
  const pending = awaitingNameByUser.get(username);
  const name = message.trim();

  if (!name) {
    reply(REPLIES.emptyName);
    return;
  }

  awaitingNameByUser.delete(username);
  finishRegistration(username, name, pending.min, pending.max, reply);
}

function cancelRegistration({ username, reply }) {
  const hadPending = pendingCornersByUser.delete(username);
  const hadAwaitingName = awaitingNameByUser.delete(username);

  if (hadPending || hadAwaitingName) {
    reply(REPLIES.registrationCancelled);
    return;
  }

  reply(REPLIES.noRegistrationOpen);
}

function getBaseNames() {
  return getBases(config.worldId).map(base => base.name);
}

function listBases({ reply }) {
  const baseNames = getBaseNames();

  if (baseNames.length === 0) {
    reply(REPLIES.noBasesRegistered);
    return;
  }

  reply(REPLIES.baseList(baseNames));
}

function removeBaseCommand({ args, reply }) {
  const name = args[0];

  if (!name) {
    reply(REPLIES.removeBaseUsage);
    return;
  }

  const result = removeBase(config.worldId, name);

  if (result.success) {
    reply(REPLIES.baseRemoved(name));
    return;
  }

  reply(REPLIES.baseNotFound(name));
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
    reply(REPLIES.baseUsage);
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