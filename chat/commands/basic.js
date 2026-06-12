const { formatPosition } = require('../../utils/position');

const commands = {
  bye: {
    description: 'Disconnects the bot.',
    aliases: ['exit', 'quit', 'leave'],
    run: async ({ bot, reply }) => {
      reply('Bye!');
      setTimeout(() => {
        bot.quit('Bot has disconnected.');
      }, 300);
    }
  },
  pos: {
    description: 'Displays the bot\'s current position.',
    aliases: ['position'],
    run: async ({ bot, reply }) => {
      reply(formatPosition(bot.entity.position));
    }
  },
  ping: {
    description: 'Replies with Pong!',
    aliases: [],
    run: async ({ reply }) => {
      reply('Pong!');
    }
  },
};

module.exports = { commands };