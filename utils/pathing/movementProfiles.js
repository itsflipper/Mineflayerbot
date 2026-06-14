const PROFILES = {
  safePathfinder: {
    canDig: true,
    canPlace: true
  },
  nearBase: {
    canDig: false,
    canPlace: false
  }
};

function getProfile(name) {
  const profile = PROFILES[name];
  if (!profile) throw new Error(`[movementProfiles] Unknown profile: "${name}"`);
  return profile;
}

module.exports = { getProfile };