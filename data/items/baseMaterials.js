// Items, die TROTZ vorhandenem Rezept als Grundmaterial gelten sollen
// (der Bot soll sie sammeln/beschaffen, nicht craften/smelten).
// Bewusst klein und additiv erweiterbar.
const BASE_MATERIAL_OVERRIDES = [
  /_ingot$/,
  /^raw_/,
  /^andesite$/,
  /^diorite$/,
  /^granite$/
];

function isOverriddenBaseMaterial(itemName) {
  return BASE_MATERIAL_OVERRIDES.some(pattern => pattern.test(itemName));
}

module.exports = { BASE_MATERIAL_OVERRIDES, isOverriddenBaseMaterial };