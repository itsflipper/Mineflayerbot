const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  bot: {
    host: 'localhost',
    port: 33333,
    username: 'BotName',
    auth: 'offline',
    version: '1.21.11'
  },
  autoStart: false
};

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function printConfigSetupMessage(reason) {
  console.error('');
  console.error('[CONFIG]');
  console.error(reason);
  console.error('');
  console.error(`A config.json file was created or repaired: ${CONFIG_PATH}`);
  console.error('Please check and adjust at least these values:');
  console.error('- bot.host');
  console.error('- bot.port');
  console.error('- bot.username');
  console.error('- bot.auth');
  console.error('- bot.version');
  console.error('');
  console.error('Important: autoStart stays false by default until BotState is stable.');
  console.error('');
}

function exitAfterConfigSetup(reason) {
  printConfigSetupMessage(reason);
  process.exit(1);
}

function createDefaultConfigAndExit() {
  writeConfig(cloneDefaultConfig());
  exitAfterConfigSetup('config.json was missing and has been created.');
}

function backupBrokenConfig(raw) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  const backupPath = path.join(__dirname, `config.invalid.${timestamp}.json`);
  fs.writeFileSync(backupPath, raw, 'utf8');

  return backupPath;
}

function repairInvalidJsonAndExit(raw) {
  const backupPath = backupBrokenConfig(raw);

  writeConfig(cloneDefaultConfig());
  exitAfterConfigSetup(`config.json was not valid JSON. Backup created: ${backupPath}`);
}

function parseConfig(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    repairInvalidJsonAndExit(raw);
  }
}

function readConfigOrRepair() {
  if (!fs.existsSync(CONFIG_PATH)) {
    createDefaultConfigAndExit();
  }

  return parseConfig(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createNormalizationState() {
  return {
    changed: false,
    mustStopForUserEdit: false
  };
}

function markChanged(state, mustStopForUserEdit = false) {
  state.changed = true;

  if (mustStopForUserEdit) {
    state.mustStopForUserEdit = true;
  }
}

function ensurePlainConfig(config, state) {
  if (isPlainObject(config)) return config;

  markChanged(state, true);
  return cloneDefaultConfig();
}

function ensureBotConfig(config, state) {
  if (isPlainObject(config.bot)) return;

  config.bot = cloneDefaultConfig().bot;
  markChanged(state, true);
}

function isMissingValue(value) {
  return value === undefined || value === null || value === '';
}

function fillMissingBotValues(config, state) {
  for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG.bot)) {
    if (!isMissingValue(config.bot[key])) continue;

    config.bot[key] = defaultValue;
    markChanged(state, true);
  }
}

function parseStringPort(config, state) {
  if (typeof config.bot.port !== 'string') return;

  const parsedPort = Number(config.bot.port);

  if (!Number.isInteger(parsedPort)) return;

  config.bot.port = parsedPort;
  markChanged(state);
}

function ensureIntegerPort(config, state) {
  if (Number.isInteger(config.bot.port)) return;

  config.bot.port = DEFAULT_CONFIG.bot.port;
  markChanged(state, true);
}

function ensureAutoStart(config, state) {
  if (typeof config.autoStart === 'boolean') return;

  config.autoStart = false;
  markChanged(state);
}

function ensureWorldId(config, state) {
  if (config.worldId) return;

  config.worldId = `world_${crypto.randomBytes(4).toString('hex')}`;
  markChanged(state);
}

function writeConfigIfChanged(config, state) {
  if (!state.changed) return;

  writeConfig(config);
}

function exitIfUserEditRequired(state) {
  if (!state.mustStopForUserEdit) return;

  exitAfterConfigSetup('config.json was incomplete and has been filled with defaults.');
}

function normalizeConfig(config) {
  const state = createNormalizationState();
  const normalizedConfig = ensurePlainConfig(config, state);

  ensureBotConfig(normalizedConfig, state);
  fillMissingBotValues(normalizedConfig, state);
  parseStringPort(normalizedConfig, state);
  ensureIntegerPort(normalizedConfig, state);
  ensureAutoStart(normalizedConfig, state);
  ensureWorldId(normalizedConfig, state);
  writeConfigIfChanged(normalizedConfig, state);
  exitIfUserEditRequired(state);

  return normalizedConfig;
}

const config = normalizeConfig(readConfigOrRepair());

module.exports = config;