const { formatPosition } = require('../utils/position');

const REPLIES = {
  bye: 'Bye!',
  pong: 'Pong!',

  gotoUsage: 'Usage: !goto <player> | <baseName> | <x> <y> <z>',
  playerNotFound: 'I could not find you. Move closer to the bot.',
  followEnabled: 'Follow mode enabled.',
  followDisabled: 'Follow mode disabled.',

  baseUsage: 'Usage: !rb start [player|x y z] | end [player|x y z] | cancel | list | remove <name>',
  positionNotFound: 'Could not resolve a position. Provide a player name, "x y z", or stand close to the bot.',
  nameTaken: name => `A base named "${name}" already exists. What should the base be called instead?`,
  baseSaved: (name, min, max) => `Base "${name}" saved: ${JSON.stringify(min)} to ${JSON.stringify(max)}`,
  cornerSet: position => `Corner 1 set (${formatPosition(position)}). Go to the opposite corner and type "!rb end".`,
  noRegistrationOpenStart: 'No registration is open. Start with "!rb start".',
  askBaseName: 'What should the base be called? Type only the name in chat.',
  emptyName: 'Please enter a name.',
  registrationCancelled: 'Registration cancelled.',
  noRegistrationOpen: 'No registration is open.',
  noBasesRegistered: 'No protected bases are registered.',
  baseList: names => `Protected bases: ${names.join(', ')}`,
  removeBaseUsage: 'Usage: !rb remove <name>',
  baseRemoved: name => `Base "${name}" removed.`,
  baseNotFound: name => `No base named "${name}" was found.`,

  unknownTask: availableTasks => `Unknown task. Available: ${availableTasks}`,
  taskFailed: taskName => `Task "${taskName}" failed.`,

  inventoryEmpty: 'Inventory is empty.',

  unknownCommand: commandName => `Unknown command: ${commandName}`,
  commandError: message => `Error occurred while executing the command: ${message}`,
  availableCommands: helpText => `Available commands: ${helpText}`
};

module.exports = { REPLIES };