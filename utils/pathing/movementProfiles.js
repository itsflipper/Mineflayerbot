const PROFILES = {
  safePathfinder: {
    canDig: true,
    canPlace: true,
    allow1by1towers: false
  },
  nearBase: {
    canDig: false,
    canPlace: false,
    allow1by1towers: false
  },
  doorSearch: {
    canDig: false,
    canPlace: false,
    allow1by1towers: false
  }
};

function getProfile(name) {
  const profile = PROFILES[name];
  if (!profile) throw new Error(`[movementProfiles] Unknown profile: "${name}"`);
  return profile;
}

module.exports = { getProfile };