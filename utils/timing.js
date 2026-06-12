function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitTicks(bot, ticks) {
  if (typeof bot.waitForTicks === 'function') {
    await bot.waitForTicks(ticks);
    return;
  }

  await wait(ticks * 50);
}

module.exports = { wait, waitTicks };