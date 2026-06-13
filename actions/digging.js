const config = require('../config');
const { canDig } = require('../safety/baseProtector');
const { waitTicks } = require('../utils/timing');
const { gotoNearPosition } = require('./navigation');

// ---------------------------------------------------------------------
// Gemeinsame Helfer
// ---------------------------------------------------------------------

function isDiggableAir(block) {
  if (!block) return false;
  return block.boundingBox === 'empty' || block.name === 'air' || block.name === 'cave_air';
}

function isProtected(position) {
  return !canDig(config.worldId, position);
}

async function digBlockAt(bot, position) {
  const block = bot.blockAt(position);

  if (isDiggableAir(block)) return { success: true, skipped: true };
  if (isProtected(position)) return { success: false, reason: 'protected', position };

  try {
    await bot.lookAt(position.offset(0.5, 0.5, 0.5), true);
    await waitTicks(bot, 1);
    await bot.dig(block);
    return { success: true };
  } catch (err) {
    return { success: false, reason: 'dig_failed', error: err.message, position };
  }
}

// ---------------------------------------------------------------------
// Treppe nach unten
// ---------------------------------------------------------------------
//
// Ein Schritt: vor dem Bot (in Blickrichtung), einen Block unter den Füßen,
// wird der Block abgebaut. Die zwei Blöcke darüber (Kopfhöhe + 1) werden
// ebenfalls abgebaut, damit der Bot hineingehen kann. Danach geht der Bot
// auf das frei gegrabene Feld - einen Block tiefer als zuvor.
//
// "vorne, einen Block unter sich" heißt: in Blickrichtung versetzt UND
// eine Y-Stufe tiefer als die aktuelle Standposition.

function getFacingOffset(bot) {
  const yaw = bot.entity.yaw;

  // Mineflayer-Yaw: 0 = Süden (+Z), Schritte von 90° = West/Nord/Ost.
  // Auf die nächste Himmelsrichtung runden, damit die Treppe gerade bleibt.
  const directions = [
    { x: 0, z: 1 },   // Süd
    { x: -1, z: 0 },  // West
    { x: 0, z: -1 },  // Nord
    { x: 1, z: 0 }    // Ost
  ];

  const index = Math.round(((yaw % (2 * Math.PI)) + 2 * Math.PI) / (Math.PI / 2)) % 4;
  return directions[index];
}

function getStaircaseStepPositions(bot, includeHeadClearance = true) {
  const offset = getFacingOffset(bot);
  const feet = bot.entity.position.floored();

  // Zielfeld: ein Block vor dem Bot, eine Stufe tiefer.
  const stepFeet = feet.offset(offset.x, -1, offset.z);

  const toDig = [
    stepFeet,                  // Boden des Zielfelds (= Stufe)
    stepFeet.offset(0, 1, 0)   // Zielfeld Körperhöhe
  ];

  // Kopfraum (eine weitere Stufe darüber) NICHT auf dem letzten Schritt
  // graben: das wäre die Decke der unteren Kammer und würde dort ein
  // zusätzliches Loch hinterlassen, durch das die Treppe von unten aus
  // 2 Blöcke hoch wirkt statt 1.
  if (includeHeadClearance) {
    toDig.push(stepFeet.offset(0, 2, 0));
  }

  return { stepFeet, toDig };
}

async function moveOntoStep(bot, stepFeet) {
  await bot.lookAt(stepFeet.offset(0.5, 0.5, 0.5), true);
  bot.setControlState('forward', true);
  await waitTicks(bot, 4);
  bot.setControlState('forward', false);
  await waitTicks(bot, 1);
}

function isStoneBlock(block, stoneNames) {
  return block && stoneNames.includes(block.name);
}

// Führt einen Treppenschritt aus und meldet, ob darunter bereits Stein liegt.
// isLastStep=true lässt den Kopfraum-Block über dem Zielfeld unangetastet
// (siehe getStaircaseStepPositions).
async function digStaircaseStep(bot, stoneNames, isLastStep) {
  const { stepFeet, toDig } = getStaircaseStepPositions(bot, !isLastStep);

  for (const position of toDig) {
    const digResult = await digBlockAt(bot, position);

    if (!digResult.success) {
      return { reachedStone: false, blocked: true, reason: digResult.reason, error: digResult.error };
    }
  }

  await moveOntoStep(bot, stepFeet);

  const belowStep = bot.blockAt(stepFeet.offset(0, -1, 0));
  return { reachedStone: isStoneBlock(belowStep, stoneNames), stepFeet };
}

// Gräbt schrittweise eine Treppe nach unten (max. maxDepth Stufen), bis
// Stein/Deepslate unter dem Bot erreicht ist oder die maximale Tiefe
// erreicht wurde. Bricht ab, falls ein Schritt blockiert ist.
//
// 'path' enthält die stepFeet-Positionen jeder erfolgreich gegrabenen Stufe
// in absteigender Reihenfolge - wird für climbStaircaseUp benötigt, um den
// Weg rückwärts wieder hochzulaufen.
async function digStaircaseDown(bot, stoneNames, maxDepth) {
  const path = [];

  for (let step = 1; step <= maxDepth; step++) {
    const isLastStep = step === maxDepth;
    const stepResult = await digStaircaseStep(bot, stoneNames, isLastStep);

    if (stepResult.blocked) {
      return { dug: step > 1, reason: stepResult.reason, error: stepResult.error, steps: step - 1, path };
    }

    path.push(stepResult.stepFeet);

    if (stepResult.reachedStone) {
      return { dug: true, reason: 'reached_stone', steps: step, path };
    }
  }

  return { dug: true, reason: 'max_depth_reached', steps: maxDepth, path };
}

// ---------------------------------------------------------------------
// Treppe wieder hoch
// ---------------------------------------------------------------------
//
// Läuft die beim Abstieg gesammelten stepFeet-Positionen in umgekehrter
// Reihenfolge ab. Die Stufen sind bereits frei gegraben (digStaircaseDown
// hat dort Boden + Körperhöhe entfernt), daher reicht ein einfaches
// Hinlaufen pro Stufe - kein erneutes Graben nötig.
async function climbStaircaseUp(bot, path) {
  for (let i = path.length - 1; i >= 0; i--) {
    const stepFeet = path[i];

    await bot.lookAt(stepFeet.offset(0.5, 1, 0.5), true);
    bot.setControlState('forward', true);
    bot.setControlState('jump', true);
    await waitTicks(bot, 5);
    bot.setControlState('forward', false);
    bot.setControlState('jump', false);
    await waitTicks(bot, 1);
  }

  return { climbed: path.length };
}

// ---------------------------------------------------------------------
// 3x3x3 Kasten vor dem Bot
// ---------------------------------------------------------------------
//
// Gräbt einen 3x3x3 Bereich, der vor dem Bot beginnt (in Blickrichtung),
// von einer Stufe unter den Füßen bis eine Stufe über dem Kopf, und drei
// Felder breit (links/mittig/rechts quer zur Blickrichtung).

function getSidewaysOffset(facing) {
  // 90 Grad gedreht zur Blickrichtung.
  return { x: -facing.z, z: facing.x };
}

function getDigBoxPositions(bot) {
  const facing = getFacingOffset(bot);
  const sideways = getSidewaysOffset(facing);
  const feet = bot.entity.position.floored();
  const front = feet.offset(facing.x, 0, facing.z);

  const positions = [];

  for (let depth = 0; depth < 3; depth++) {
    for (let height = -1; height <= 1; height++) {
      for (let side = -1; side <= 1; side++) {
        positions.push(
          front
            .offset(facing.x * depth, height, facing.z * depth)
            .offset(sideways.x * side, 0, sideways.z * side)
        );
      }
    }
  }

  return positions;
}

// Gräbt den 3x3x3 Kasten vor dem Bot ab. Liefert eine Fehlerliste für
// Blöcke, die nicht abgebaut werden konnten (z.B. geschützt), gräbt aber
// trotzdem weiter, statt beim ersten Fehler abzubrechen.
//
// Danach läuft der Bot in die Mitte des Kastens (Aufnahmeradius von
// Minecraft deckt von dort aus den ganzen Kasten ab), damit liegende Drops
// (Cobblestone etc.) tatsächlich eingesammelt werden und nicht einfach
// liegen bleiben.
async function digBoxInFront(bot) {
  const positions = getDigBoxPositions(bot);
  const errors = [];

  for (const position of positions) {
    const digResult = await digBlockAt(bot, position);

    if (!digResult.success) {
      errors.push(digResult);
    }
  }

  await collectDropsInBox(bot);

  return { success: errors.length === 0, errors };
}

// Mittelpunkt des 3x3x3 Kastens (depth=1, height=0, side=0) - von dort
// erreicht der Aufnahmeradius alle Drops im Kasten.
async function collectDropsInBox(bot) {
  const facing = getFacingOffset(bot);
  const feet = bot.entity.position.floored();
  const center = feet.offset(facing.x * 2, 0, facing.z * 2);

  await gotoNearPosition(bot, center, 0, 'goto_dig_box_center');
  await waitTicks(bot, 6);
}

module.exports = {
  digBlockAt,
  digStaircaseDown,
  climbStaircaseUp,
  digBoxInFront,
  getFacingOffset
};