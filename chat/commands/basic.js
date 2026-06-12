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
      const pos = bot.entity.position;
      reply(`x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
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