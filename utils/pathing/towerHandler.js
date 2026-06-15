const { Vec3 } = require('vec3');
const { waitTicks } = require('../timing');

const SCAFFOLD_ITEM_NAMES = [
  'dirt', 'cobblestone', 'netherrack', 'sand', 'gravel',
  'stone', 'cobbled_deepslate', 'oak_planks', 'spruce_planks',
  'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks'
];

const CENTER_TOLERANCE   = 0.2;
const PLACE_Y_WINDOW_MIN = 0.15;
const PLACE_Y_WINDOW_MAX = 0.85;
const MAX_PLACE_TICKS    = 30;
const MAX_PLACE_ATTEMPTS = 2;   // Fix 6: bis zu 2 Versuche im Fenster

// Fix 3: horizontale Nähe zum Ziel, bevor Towern erlaubt wird.
// Großzügig genug für GoalNear/GoalBlock, verhindert aber Towern "irgendwo".
const TOWER_HORIZONTAL_TOLERANCE = 0.6;

// ---------------------------------------------------------------------
// Scaffold-Item
// ---------------------------------------------------------------------

function findScaffoldItem(bot) {
  for (const name of SCAFFOLD_ITEM_NAMES) {
    const itemDef = bot.registry.itemsByName[name];
    if (!itemDef) continue;

    const item = bot.inventory.findInventoryItem(itemDef.id, null, false);
    if (item) return item;
  }

  return null;
}

// ---------------------------------------------------------------------
// Zentrieren
// ---------------------------------------------------------------------

function getBlockCenter(pos) {
  return pos.floored().offset(0.5, 0, 0.5);
}

function isCentered(bot) {
  const center = getBlockCenter(bot.entity.position);
  const dx = Math.abs(bot.entity.position.x - center.x);
  const dz = Math.abs(bot.entity.position.z - center.z);
  return dx < CENTER_TOLERANCE && dz < CENTER_TOLERANCE;
}

async function centerOnBlock(bot) {
  if (isCentered(bot)) return;

  const center = getBlockCenter(bot.entity.position);
  await bot.lookAt(center.offset(0, bot.entity.height, 0), true);
  bot.setControlState('forward', true);
  await waitTicks(bot, 3);
  bot.setControlState('forward', false);
  await waitTicks(bot, 2);
}

// ---------------------------------------------------------------------
// Platzier-Fenster
// ---------------------------------------------------------------------

function getYOffset(bot) {
  return bot.entity.position.y - Math.floor(bot.entity.position.y);
}

function isInPlaceWindow(bot) {
  const yOffset = getYOffset(bot);
  return yOffset >= PLACE_Y_WINDOW_MIN && yOffset <= PLACE_Y_WINDOW_MAX;
}

// ---------------------------------------------------------------------
// Block unter den Füßen platzieren
// ---------------------------------------------------------------------

// Fix 2/3: kein lookAt hier – Ausrichten passiert einmalig in prepareForJump,
// nicht erneut während des Sprungs, damit das Platzierfenster nicht verloren geht.
async function attemptPlace(bot, referenceBlock, targetPos) {
  if (!referenceBlock || referenceBlock.name === 'air') {
    return { success: false, reason: 'invalid_reference_block' };
  }

  const faceVector = new Vec3(0, 1, 0);

  if (typeof bot._genericPlace === 'function') {
    await bot._genericPlace(referenceBlock, faceVector, { swingArm: 'right', forceLook: 'ignore' });
  } else if (typeof bot._placeBlockWithOptions === 'function') {
    await bot._placeBlockWithOptions(referenceBlock, faceVector, { swingArm: 'right', forceLook: 'ignore' });
  } else {
    await bot.placeBlock(referenceBlock, faceVector);
  }

  // Fix 7: 1 Tick reicht für den Block-Update-Check; nur bei Bedarf auf 2 erhöhen.
  await waitTicks(bot, 1);

  const placedBlock = bot.blockAt(targetPos, false);
  if (!placedBlock || placedBlock.name === 'air') {
    return { success: false, reason: 'block_not_placed' };
  }

  return { success: true };
}

// ---------------------------------------------------------------------
// Vor dem Sprung stabilisieren
// ---------------------------------------------------------------------

async function stabilizeBeforeJump(bot) {
  bot.clearControlStates();
  bot.entity.velocity.x = 0;
  bot.entity.velocity.z = 0;
  await waitTicks(bot, 2);
}

async function waitForGround(bot) {
  for (let tick = 0; tick < 10; tick++) {
    if (bot.entity.onGround) return true;
    await waitTicks(bot, 1);
  }
  return false;
}

// ---------------------------------------------------------------------
// Ein Tower-Schritt nach oben (Extraction der Teilschritte)
// ---------------------------------------------------------------------

function getTowerStepPositions(bot) {
  const startFeetPos = bot.entity.position.floored();
  const referencePos = startFeetPos.offset(0, -1, 0);
  const targetPos    = referencePos.offset(0, 1, 0);
  return { referencePos, targetPos };
}

async function prepareForJump(bot, scaffoldItem, referenceBlock) {
  await bot.equip(scaffoldItem, 'hand');
  await stabilizeBeforeJump(bot);

  const onGround = await waitForGround(bot);
  if (!onGround) return false;

  await bot.lookAt(referenceBlock.position.offset(0.5, 1.0, 0.5), true);
  return true;
}

async function jumpAndPlace(bot, referenceBlock, targetPos) {
  bot.setControlState('jump', true);

  for (let tick = 0; tick < MAX_PLACE_TICKS; tick++) {
    await waitTicks(bot, 1);

    if (!isInPlaceWindow(bot)) continue;

    // Fix 6: bis zu MAX_PLACE_ATTEMPTS Versuche im Fenster, bevor aufgegeben wird.
    for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS; attempt++) {
      const result = await attemptPlace(bot, referenceBlock, targetPos);

      if (result.success) {
        // Fix 9: Jump erst nach bestätigter Platzierung deaktivieren.
        bot.setControlState('jump', false);
        await waitTicks(bot, 2);
        return result;
      }

      // Kurze Pause zwischen Retry-Versuchen.
      if (attempt < MAX_PLACE_ATTEMPTS - 1) await waitTicks(bot, 1);
    }

    // Alle Versuche im Fenster fehlgeschlagen.
    bot.setControlState('jump', false);
    await waitTicks(bot, 2);
    return { success: false, reason: 'block_not_placed' };
  }

  bot.setControlState('jump', false);
  await waitTicks(bot, 2);

  return { success: false, reason: 'place_window_missed' };
}

async function towerOneBlock(bot, scaffoldItem) {
  await centerOnBlock(bot);

  const { referencePos, targetPos } = getTowerStepPositions(bot);
  const referenceBlock = bot.blockAt(referencePos, false);

  if (!referenceBlock || referenceBlock.name === 'air') {
    return { success: false, reason: 'no_reference_block' };
  }

  const targetBlock = bot.blockAt(targetPos, false);
  if (targetBlock && targetBlock.name !== 'air') {
    return { success: true, reason: 'already_placed' };
  }

  const ready = await prepareForJump(bot, scaffoldItem, referenceBlock);
  if (!ready) return { success: false, reason: 'not_on_ground' };

  return await jumpAndPlace(bot, referenceBlock, targetPos);
}

// ---------------------------------------------------------------------
// Retry-Einstiegspunkt für index.js
// ---------------------------------------------------------------------

const MAX_TOWER_STEPS = 16;

// Fix 3: Ziel muss höher liegen UND der Bot muss horizontal nahe genug
// am Ziel stehen, sonst kein Towern.
function isHorizontallyCloseToGoal(bot, goalVec) {
  const botPos = bot.entity.position;
  const dx = Math.abs(botPos.x - (goalVec.x + 0.5));
  const dz = Math.abs(botPos.z - (goalVec.z + 0.5));
  return dx <= TOWER_HORIZONTAL_TOLERANCE && dz <= TOWER_HORIZONTAL_TOLERANCE;
}

function shouldTryTower(bot, goalVec) {
  if (!goalVec) return false;
  if (goalVec.y <= Math.floor(bot.entity.position.y)) return false;
  return isHorizontallyCloseToGoal(bot, goalVec);
}

function hasReachedTargetHeight(bot, goalVec) {
  return bot.entity.position.y >= goalVec.y;
}

// Fix 5: vertikalen Fortschritt messen – weniger als 0.7 gilt als kein Fortschritt.
function hasMadeVerticalProgress(oldY, newY) {
  return (newY - oldY) >= 0.7;
}

// Fix 1/2: Loop intern im Handler, nicht über index.js-Retries.
// Fix 7: Scaffold nach jedem Step neu suchen.
// Fix 8: Pathfinder wird einmal gestoppt, nicht zwischen Steps.
async function towerUntilHeight(bot, goalVec) {
  for (let step = 0; step < MAX_TOWER_STEPS; step++) {
    if (hasReachedTargetHeight(bot, goalVec)) {
      return { success: true, reason: 'target_height_reached' };
    }

    // Fix 7: Scaffold nach jedem Step neu prüfen.
    const scaffoldItem = findScaffoldItem(bot);
    if (!scaffoldItem) {
      return { success: false, reason: 'no_scaffold_item' };
    }

    const oldY = bot.entity.position.y;
    const result = await towerOneBlock(bot, scaffoldItem);

    if (!result.success) {
      return { success: false, reason: result.reason ?? 'tower_step_failed' };
    }

    // Fix 5: kein echter Fortschritt → abbrechen.
    if (!hasMadeVerticalProgress(oldY, bot.entity.position.y)) {
      return { success: false, reason: 'no_vertical_progress' };
    }
  }

  return { success: false, reason: 'max_steps_reached' };
}

async function tryTowerRetry(bot, goalVec) {
  if (!shouldTryTower(bot, goalVec)) {
    return { success: false, reason: 'goal_not_above' };
  }

  // Fix 8: Pathfinder einmal stoppen, dann Loop übernimmt.
  bot.pathfinder?.setGoal?.(null);
  bot.clearControlStates();

  return await towerUntilHeight(bot, goalVec);
}

module.exports = { tryTowerRetry };