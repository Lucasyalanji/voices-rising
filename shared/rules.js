// Game rules shared by the main server, game servers and the client.
// Change the numbers here to tune the campaign.

export const RULES = {
  POLITICIANS_PER_ZONE: 10,
  SIGS_PER_POLITICIAN: 10, // 10 real signatures turn one politician from red to blue
  SIGS_PER_ZONE: 100, // 100 signatures opens the next protest zone
  ZONE_COUNT: 5,
  MARCH_THRESHOLD: 1000, // 1,000 blue supporters -> march on City Council (Town Hall)
  PARLIAMENT_THRESHOLD: 10000, // 10,000 -> march on Parliament House
  MAJORITY: 6, // blue MPs needed (of 10) to vote the reds out of Parliament

  RALLY_TIME: 12, // seconds of yarning (1 player) to win over a rally crowd
  RALLY_BASE: 100, // supporters gained per rally crowd
  RALLY_COOLDOWN: 60,
  COLLAB_BONUS: 0.5, // +50% per extra player yarning together
  RECRUIT_NPC: 15, // talking a wandering youth into the movement
  SABOTAGE_PENALTY: 40,
  SABOTAGE_COOLDOWN: 40,
  RUMOUR_CLEAR_TIME: 4,

  MEETING_COOLDOWN: 60,
  VOTE_TIME: 45,
  MIN_PLAYERS_FOR_VOTE: 3,
  MIN_PLAYERS_FOR_RED: 3,
  EJECT_RED_MS: 10 * 60 * 1000,
  EJECT_BLUE_MS: 2 * 60 * 1000,
  WRONG_VOTE_PENALTY: 50,

  STAGE_BASE: 60, // supporters for finishing a stage performance
  STAGE_PER_LISTENER: 0.25, // +25% per listener in the crowd
  STAGE_REACTION: 2, // supporters per audience reaction
  STAGE_MAX_SECONDS: 180,
  STAGE_REPORTS_TO_CUT: 3,
  STAGE_LISTEN_RADIUS: 140,

  MARCH_SPEED: 5, // units / second
  FLAG_HOLD_SECONDS: 10,
};

// Zone order: Redfern (start) -> Central -> Town Hall (City Council + main stage) -> Hyde Park -> Parliament.
export const ZONE_KEYS = ['redfern', 'central', 'townhall', 'hydepark', 'parliament'];

const SURNAMES = [
  'Hartley', 'Pembroke', 'Whitcombe', 'Ashford', 'Langley', 'Thornbury', 'Caldwell', 'Fairhaven', 'Merriweather', 'Blackwood',
  'Kingsley', 'Holloway', 'Rutherford', 'Ellsworth', 'Crowley', 'Davenport', 'Winslow', 'Sterling', 'Pryce', 'Abernathy',
  'Lockhart', 'Grantham', 'Haverford', 'Ainsley', 'Marchetti', 'Okafor', 'Nguyen-Hale', 'Castellan', 'Dunmore', 'Faulkner',
  'Hargreaves', 'Ivers', 'Jessop', 'Kendrick', 'Lowther', 'Montague', 'Norbury', 'Oakes', 'Penrose', 'Quill',
  'Radcliffe', 'Sutcliffe', 'Tremayne', 'Underhill', 'Vance', 'Whitlock', 'Yardley', 'Zeller', 'Bramwell', 'Colter',
];
const INITIALS = 'ABCDEFGHJKLMNPRSTW';

// Fictional politicians only — no real people are depicted.
export function politicianName(zone, i) {
  const n = zone * RULES.POLITICIANS_PER_ZONE + i;
  const title = zone === RULES.ZONE_COUNT - 1 ? 'MP' : 'Councillor';
  return `${title} ${INITIALS[(n * 7) % INITIALS.length]}. ${SURNAMES[n % SURNAMES.length]}`;
}

// Single source of truth for campaign progress, derived from raw counters.
export function deriveCampaign({ signatures = 0, supporters = 0, councilMarch = 0, parliamentMarch = 0, flagRaised = 0, victory = 0 } = {}) {
  const { SIGS_PER_ZONE, SIGS_PER_POLITICIAN, POLITICIANS_PER_ZONE, ZONE_COUNT } = RULES;
  const zoneIndex = Math.min(ZONE_COUNT - 1, Math.floor(signatures / SIGS_PER_ZONE));
  const flipped = [];
  for (let z = 0; z < ZONE_COUNT; z++) {
    const inZone = signatures - z * SIGS_PER_ZONE;
    flipped.push(Math.max(0, Math.min(POLITICIANS_PER_ZONE, Math.floor(inZone / SIGS_PER_POLITICIAN))));
  }
  const allDone = signatures >= ZONE_COUNT * SIGS_PER_ZONE;
  const unlocked = ZONE_KEYS.map((_, z) => z <= zoneIndex || (ZONE_KEYS[z] === 'townhall' && !!councilMarch));
  return {
    signatures,
    supporters: Math.max(0, supporters),
    zoneIndex,
    unlocked,
    flipped,
    nextPoliticianIn: allDone ? 0 : SIGS_PER_POLITICIAN - (signatures % SIGS_PER_POLITICIAN),
    nextZoneIn: zoneIndex < ZONE_COUNT - 1 ? (zoneIndex + 1) * SIGS_PER_ZONE - signatures : 0,
    marchUnlocked: supporters >= RULES.MARCH_THRESHOLD,
    parliamentUnlocked: supporters >= RULES.PARLIAMENT_THRESHOLD && zoneIndex >= ZONE_COUNT - 1,
    councilMarch: !!councilMarch,
    parliamentMarch: !!parliamentMarch,
    flagRaised: !!flagRaised,
    victory: !!victory,
    blueMPs: flipped[ZONE_COUNT - 1],
  };
}

export const PETITION = {
  title: 'Hear Indigenous Youth Voices',
  text:
    'We call on the City of Sydney Council and the NSW Parliament to create a permanent, funded ' +
    'Indigenous Youth Voice — led by young Aboriginal and Torres Strait Islander people, guided by Elders — ' +
    'with a real say in the decisions that affect our communities, our culture and our Country.',
};
