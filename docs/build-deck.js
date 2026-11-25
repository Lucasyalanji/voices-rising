// Builds "Voices Rising Guide.pptx" in the Wathaga style: Game Overview, Developer Guide and Wireframes.
const pptxgen = require("pptxgenjs");
const { applyTheme } = require("C:/Users/Briscoe_Phoenix/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/local-agent-mode-sessions/skills-plugin/008d08cf-8271-472a-a308-48d2f34c007e/8fbc9d82-b475-40ac-80da-01687a37281d/skills/pptx/scripts/apply_theme.js");

const K = { paper: "FDF7F0", white: "FFFFFF", sand: "F7CD99", peach: "FAEAD8", rust: "B34420", rustDeep: "823015", mob: "6E2610",
  orange: "E69840", teal: "3E6765", green: "476F59", charcoal: "4A4A49", ink: "3B3530", muted: "6F655C", line: "E9DCCC", blue: "2F7BFF", red: "E03131" };
const HEAD = "Caveat Brush", BODY = "Calibri", MONO = "Consolas";
const THEME = { name: "Wathaga", headFontFace: HEAD, bodyFontFace: BODY,
  colors: { dk1: K.ink, lt1: K.white, dk2: K.charcoal, lt2: K.paper, accent1: K.rust, accent2: K.teal, accent3: K.orange, accent4: K.green, accent5: K.mob, accent6: K.sand, hlink: K.rust, folHlink: K.rustDeep } };
const IMG = (n) => `img/${n}.png`;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.title = "Voices Rising Guide";
pres.author = "Kowa Collaboration";
pres.company = "Kowa Collaboration";
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };

// ---------- Layouts ----------
pres.defineSlideMaster({
  title: "WATHAGA_DARK",
  background: { color: K.charcoal },
  objects: [{ image: { path: IMG("border"), x: 0, y: 5.2, w: 10, h: 0.34, sizing: { type: "cover", w: 10, h: 0.34 } } }],
  slideNumber: { x: 9.35, y: 4.85, w: 0.5, h: 0.25, fontFace: BODY, fontSize: 9, color: K.sand },
});
pres.defineSlideMaster({
  title: "WATHAGA_CONTENT",
  background: { color: K.paper },
  objects: [
    { image: { path: IMG("logo"), x: 0.5, y: 5.08, w: 0.95, h: 0.3 } },
    { text: { text: "Voices Rising: Sydney · First Nations Youth", options: { x: 1.6, y: 5.1, w: 6, h: 0.26, fontFace: BODY, fontSize: 9, color: K.muted, margin: 0 } } },
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.28, w: 9, h: 0.75, fontFace: "+mj-lt", fontSize: 36, color: K.rust, valign: "middle", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 9.2, y: 5.1, w: 0.4, h: 0.26, fontFace: BODY, fontSize: 9, color: K.muted, align: "right" },
});

const content = (section, title) => {
  const s = pres.addSlide({ masterName: "WATHAGA_CONTENT", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  return s;
};
const txt = (s, text, o) => s.addText(text, { isTextBox: true, fontFace: BODY, fontSize: 14, color: K.ink, margin: 0, valign: "top", ...o });
const box = (s, o) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { rectRadius: 0.1, line: { color: K.line, width: 1 }, fill: { color: K.white }, ...o });
const shadow = () => ({ type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.12 });
const circleNum = (s, n, x, y, d = 0.5, fill = K.rust) => {
  s.addShape(pres.shapes.OVAL, { x: x - 0.05, y: y - 0.05, w: d + 0.1, h: d + 0.1, fill: { color: K.charcoal }, line: { color: K.charcoal } });
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: K.white, width: 2 } });
  txt(s, String(n), { x, y, w: d, h: d, fontFace: "+mj-lt", fontSize: 20, color: K.white, align: "center", valign: "middle" });
};

// =============== 1. Title ===============
pres.addSection({ title: "Game Overview" });
{
  const s = pres.addSlide({ masterName: "WATHAGA_DARK", sectionTitle: "Game Overview" });
  s.addImage({ path: IMG("logo-neg"), x: 0.6, y: 0.55, w: 2.2, h: 0.7 });
  txt(s, "Voices Rising: Sydney", { x: 0.6, y: 1.55, w: 6.2, h: 1.2, fontFace: "+mj-lt", fontSize: 50, color: K.white, valign: "middle" });
  txt(s, "Game Overview, Developer Guide and Wireframes", { x: 0.6, y: 2.9, w: 6.2, h: 0.4, fontSize: 18, color: K.sand });
  txt(s, "A 3D online game for young people aged 15–25, set on Gadigal Country. Part of the First Nations Youth initiative in Wathaga.",
    { x: 0.6, y: 3.45, w: 5.6, h: 0.9, fontSize: 14, color: "F3E4D2" });
  s.addImage({ path: IMG("mark"), x: 6.85, y: 1.0, w: 2.7, h: 2.35 });
  s.addNotes("Voices Rising: Sydney is a 3D online game for young people aged 15 to 25, built inside the First Nations Youth initiative in Wathaga.");
}

// =============== 2. Acknowledgement ===============
{
  const s = pres.addSlide({ masterName: "WATHAGA_DARK", sectionTitle: "Game Overview" });
  s.background = { color: K.mob };
  s.addImage({ path: IMG("pattern"), x: 0, y: 0, w: 10, h: 5.625, sizing: { type: "cover", w: 10, h: 5.625 } });
  txt(s, "Always was, always will be", { x: 1, y: 1.45, w: 8, h: 1, fontFace: "+mj-lt", fontSize: 44, color: K.white, align: "center", valign: "middle" });
  txt(s, "We acknowledge the Gadigal people of the Eora Nation, the Traditional Custodians of the land this game is set on, and pay our respects to Elders past and present.",
    { x: 1.4, y: 2.6, w: 7.2, h: 1.2, fontSize: 18, color: "FCEBD6", align: "center" });
}

// =============== 3. What the game is ===============
{
  const s = content("Game Overview", "What the game is");
  txt(s, "Players start at the fire on The Block in Redfern, meet the Elders, and grow a youth movement across a real map of Sydney.",
    { x: 0.5, y: 1.25, w: 4.6, h: 1.0, fontSize: 17, bold: true, color: K.mob });
  txt(s, [
    { text: "Together they win over crowds, find the spies among them, gather real petition signatures, take the Town Hall stage and march on Parliament House.", options: { breakLine: true } },
    { text: " ", options: { breakLine: true, fontSize: 6 } },
    { text: "Cel-shaded 3D in a web browser or the Android app. Every place sits at its real latitude and longitude: Redfern, Central, Town Hall, Hyde Park and Macquarie St." },
  ], { x: 0.5, y: 2.35, w: 4.6, h: 2.4, fontSize: 14 });
  s.addImage({ path: IMG("art"), x: 5.4, y: 1.25, w: 4.1, h: 2.31, rounding: false, shadow: shadow() });
  txt(s, "Meeting places: players move between yarning circles, rallies and the stage, joined by the march routes.",
    { x: 5.4, y: 3.7, w: 4.1, h: 0.6, fontSize: 11, color: K.muted, italic: true });
}

// =============== 4. Journey ===============
{
  const s = content("Game Overview", "The player's journey");
  const steps = [
    ["Meet the Elders", "Aunty Merle and Uncle Ray yarn at the fire, then ask three questions"],
    ["Grow the movement", "Hold E in a rally ring; yarning together wins more supporters"],
    ["Find the Reds", "Spies hide among blues. Call the Yarning Circle and vote"],
    ["Lobby", "Share your petition link: real signatures turn politicians blue"],
    ["March on Council", "At 1,000 supporters, walk from The Block to Town Hall"],
    ["Take the stage", "Share a speech, poem or music, and go live with your voice"],
    ["The main protest", "At 10,000, march from the stage to Parliament House"],
    ["Raise the flag", "Hold the flagpole together; 6 blue MPs vote the Reds out"],
  ];
  steps.forEach(([h, d], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = 0.5 + col * 2.3, y = 1.3 + row * 1.85;
    circleNum(s, i + 1, x, y, 0.5);
    txt(s, h, { x: x + 0.7, y: y + 0.02, w: 1.5, h: 0.46, fontSize: 14, bold: true, color: K.mob, valign: "middle" });
    txt(s, d, { x, y: y + 0.65, w: 2.1, h: 0.95, fontSize: 12, color: K.ink });
  });
}

// =============== 5. Zones ===============
{
  const s = content("Game Overview", "Protest zones open with real signatures");
  const zones = [["0", "Redfern: The Block", "Elders' fire, mural, first rallies"], ["100", "Central & Prince Alfred Park", "Railway Square, Central forecourt"],
    ["200", "Town Hall", "City Council and the Main Stage"], ["300", "Hyde Park", "Archibald Fountain, Pool of Reflection"], ["400", "Macquarie St", "Parliament House and the flagpole"]];
  zones.forEach(([n, name, d], i) => {
    const x = 0.5 + i * 1.82, alt = i % 2 === 1;
    box(s, { x, y: 1.35, w: 1.7, h: 2.75, fill: { color: alt ? K.peach : K.white }, line: { color: alt ? K.sand : K.line, width: 1 } });
    txt(s, n, { x: x + 0.15, y: 1.5, w: 1.4, h: 0.65, fontFace: "+mj-lt", fontSize: 34, color: alt ? K.teal : K.rust });
    txt(s, "signatures", { x: x + 0.15, y: 2.12, w: 1.4, h: 0.25, fontSize: 10, color: K.muted });
    txt(s, name, { x: x + 0.15, y: 2.5, w: 1.45, h: 0.75, fontSize: 13, bold: true, color: K.mob });
    txt(s, d, { x: x + 0.15, y: 3.25, w: 1.45, h: 0.75, fontSize: 11, color: K.ink });
  });
  txt(s, "Every 100 signatures opens the next zone. Town Hall also opens when the first march arrives there.", { x: 0.5, y: 4.35, w: 9, h: 0.4, fontSize: 13, color: K.muted });
}

// =============== 6. Blue and Red ===============
{
  const s = content("Game Overview", "Blue and Red");
  const card = (x, color, head, body) => {
    box(s, { x, y: 1.3, w: 4.35, h: 2.85, shadow: shadow() });
    s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: 1.55, w: 0.55, h: 0.55, fill: { color }, line: { color } });
    txt(s, head, { x: x + 1.0, y: 1.55, w: 3.1, h: 0.55, fontSize: 20, bold: true, color, valign: "middle" });
    txt(s, body, { x: x + 0.3, y: 2.3, w: 3.8, h: 1.75, fontSize: 14 });
  };
  card(0.5, K.blue, "Blue: the movement", "Yarns with crowds, clears rumours, questions strangers, lobbies with real signatures and leads the marches.");
  card(5.15, K.red, "Red: the spies", "Look blue to everyone else. Sabotage rallies with Q and heckle the stage. About one in four players once three are in the city.");
  txt(s, "Voted-out Reds wait outside the city for 10 minutes, then return as blue. A wrongly accused blue is out for 2 minutes and the movement loses 50 supporters.",
    { x: 0.5, y: 4.3, w: 9, h: 0.6, fontSize: 12, color: K.muted });
}

// =============== 7. Stage + signatures ===============
{
  const s = content("Game Overview", "The stage and real signatures");
  box(s, { x: 0.5, y: 1.3, w: 4.35, h: 3.5, fill: { color: K.charcoal }, line: { color: K.charcoal } });
  txt(s, "Town Hall Main Stage", { x: 0.8, y: 1.5, w: 3.8, h: 0.5, fontFace: "+mj-lt", fontSize: 26, color: K.sand });
  txt(s, [
    { text: "Perform a speech, a poem or music", options: { bullet: true, breakLine: true } },
    { text: "Your lines light up the big screen", options: { bullet: true, breakLine: true } },
    { text: "Go Live streams your voice to the crowd", options: { bullet: true, breakLine: true } },
    { text: "+60 supporters, +25% per listener, +2 per ✊ ❤", options: { bullet: true } },
  ], { x: 0.8, y: 2.15, w: 3.8, h: 2.4, fontSize: 14, color: K.white, paraSpaceAfter: 8 });
  txt(s, "The petition", { x: 5.15, y: 1.3, w: 4.35, h: 0.5, fontFace: "+mj-lt", fontSize: 26, color: K.rust });
  txt(s, "A permanent, funded Indigenous Youth Voice for the City of Sydney and NSW Parliament, led by young Aboriginal and Torres Strait Islander people and guided by Elders.",
    { x: 5.15, y: 1.9, w: 4.35, h: 1.3, fontSize: 14 });
  box(s, { x: 5.15, y: 3.35, w: 4.35, h: 1.45, fill: { color: K.peach }, line: { color: K.sand } });
  txt(s, "Signed on the game's petition page or the Wathaga survey Hear Indigenous Youth Voices. The two are linked both ways, and nobody is counted twice.",
    { x: 5.35, y: 3.5, w: 3.95, h: 1.2, fontSize: 13 });
}

// =============== 8. Numbers ===============
{
  const s = content("Game Overview", "Numbers at a glance");
  const stats = [["10", "signatures turn one politician blue"], ["100", "signatures open the next zone"], ["1,000", "supporters march on City Council"],
    ["10,000", "supporters march on Parliament"], ["6 of 10", "blue MPs vote the Reds out"], ["+100", "supporters per rally crowd"]];
  stats.forEach(([n, l], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.5 + col * 3.05, y = 1.3 + row * 1.75;
    box(s, { x, y, w: 2.85, h: 1.55 });
    txt(s, n, { x: x + 0.25, y: y + 0.15, w: 2.4, h: 0.75, fontFace: "+mj-lt", fontSize: 40, color: i % 2 ? K.teal : K.rust });
    txt(s, l, { x: x + 0.25, y: y + 0.95, w: 2.4, h: 0.5, fontSize: 13 });
  });
}

// =============== 9. Safety ===============
{
  const s = content("Game Overview", "Safety and culture");
  const rows = [["Ages 15–25", "Checked at sign-up, with community rules every player accepts"],
    ["Mute and report", "Listeners can mute the stage; enough reports pause a performance, and every report reaches moderators"],
    ["Elders own the words", "The Elders' dialogue is a placeholder until local Elders review, rewrite and own it"],
    ["Fictional people", "All characters and politicians are made up"]];
  rows.forEach(([h, d], i) => {
    const y = 1.3 + i * 0.9;
    circleNum(s, i + 1, 0.55, y + 0.05, 0.45, i % 2 ? K.teal : K.rust);
    txt(s, h, { x: 1.3, y, w: 2.4, h: 0.6, fontSize: 15, bold: true, color: K.mob, valign: "middle" });
    txt(s, d, { x: 3.8, y, w: 5.7, h: 0.6, fontSize: 13, valign: "middle" });
  });
}

// =============== 10. Developer divider ===============
pres.addSection({ title: "Developer Guide" });
{
  const s = pres.addSlide({ masterName: "WATHAGA_DARK", sectionTitle: "Developer Guide" });
  txt(s, "Developer Guide", { x: 0.6, y: 1.6, w: 6, h: 1.1, fontFace: "+mj-lt", fontSize: 54, color: K.white, valign: "middle" });
  txt(s, "Node.js 22.5+ · Three.js · SQLite · WebSocket · WebRTC · Capacitor", { x: 0.6, y: 2.8, w: 6.5, h: 0.4, fontSize: 16, color: K.sand });
  s.addImage({ path: IMG("mark"), x: 7.0, y: 1.2, w: 2.3, h: 2.0 });
}

// =============== 11. Architecture ===============
{
  const s = content("Developer Guide", "How it fits together");
  const node = (x, y, w, h, head, body, fill, color) => {
    box(s, { x, y, w, h, fill: { color: fill }, line: { color: fill === K.white ? K.line : fill } });
    txt(s, head, { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.35, fontSize: 14, bold: true, color });
    txt(s, body, { x: x + 0.15, y: y + 0.45, w: w - 0.3, h: h - 0.5, fontSize: 11, color });
  };
  node(0.5, 1.35, 2.2, 0.75, "Petition page", "Real people sign", K.white, K.ink);
  node(0.5, 2.3, 2.2, 0.75, "Wathaga survey", "Synced both ways", K.white, K.ink);
  node(3.4, 1.35, 3.2, 1.7, "Main server  :4000", "Profiles and logins · real signatures · campaign · stage archive · reports\ndata/main.db (SQLite)", K.charcoal, K.white);
  node(3.4, 3.55, 2.0, 1.25, "Game server A", "World, spies, votes, marches, stage", K.peach, K.ink);
  node(5.6, 3.55, 2.0, 1.25, "Game server B", "One per community", K.peach, K.ink);
  node(7.8, 3.55, 1.7, 1.25, "Players", "Browser or Android app", K.white, K.ink);
  const arrow = (x, y, w, h) => s.addShape(pres.shapes.LINE, { x, y, w, h, line: { color: K.rust, width: 2, endArrowType: "triangle" } });
  arrow(2.7, 1.72, 0.7, 0); arrow(2.7, 2.67, 0.7, 0);
  // upward arrows: positive size, arrowhead at the start (top)
  const up = (x) => s.addShape(pres.shapes.LINE, { x, y: 3.05, w: 0, h: 0.5, line: { color: K.rust, width: 2, beginArrowType: "triangle" } });
  up(4.4); up(6.6);
  s.addShape(pres.shapes.LINE, { x: 7.6, y: 4.17, w: 0.2, h: 0, line: { color: K.rust, width: 2, beginArrowType: "triangle" } });
  txt(s, "Game servers talk to the main server with a shared server key.", { x: 6.8, y: 1.45, w: 2.7, h: 1.2, fontSize: 12, color: K.muted });
}

// =============== 12. Run + settings ===============
{
  const s = content("Developer Guide", "Run it locally");
  box(s, { x: 0.5, y: 1.3, w: 3.9, h: 1.3, fill: { color: K.charcoal }, line: { color: K.charcoal } });
  txt(s, "npm install\nnpm run dev", { x: 0.75, y: 1.45, w: 3.4, h: 1.0, fontFace: MONO, fontSize: 16, color: K.sand });
  txt(s, "Main server on :4000, game server on :3000. Open http://localhost:3000 and create a profile.", { x: 0.5, y: 2.75, w: 3.9, h: 0.85, fontSize: 13 });
  txt(s, "DEV chat commands: /sigs 100 · /sup 1000 · /tp 0-4 · /red · /skipmarch · /reset", { x: 0.5, y: 3.65, w: 3.9, h: 0.8, fontSize: 12, color: K.muted });
  const rows = [["Setting", "What it does"], ["TOKEN_SECRET", "Signs login tokens"], ["SERVER_KEYS / SERVER_KEY", "Game ↔ main server key"],
    ["ADMIN_KEY", "Export, moderation, bans"], ["WATHAGA_*", "Two-way survey link"], ["MAIN_PUBLIC_URL", "Address in share links"], ["DEV", "Chat cheats; never live"]];
  s.addTable(rows.map((r, i) => r.map((c, j) => ({ text: c, options: {
    bold: i === 0, fontFace: j === 0 && i > 0 ? MONO : BODY, fontSize: i === 0 ? 11 : 11.5, color: i === 0 ? K.muted : K.ink,
    fill: { color: i === 0 ? K.peach : K.white } } }))), { x: 4.75, y: 1.3, w: 4.75, colW: [2.15, 2.6], rowH: 0.42, border: { type: "solid", color: K.line, pt: 1 }, margin: 0.06 });
  txt(s, "All game numbers live in shared/rules.js", { x: 4.75, y: 4.4, w: 4.75, h: 0.35, fontSize: 12, color: K.muted, italic: true });
}

// =============== 13. Survey + Android ===============
{
  const s = content("Developer Guide", "Wathaga survey link and Android app");
  txt(s, "Survey ⇄ petition", { x: 0.5, y: 1.3, w: 4.3, h: 0.45, fontFace: "+mj-lt", fontSize: 24, color: K.teal });
  txt(s, [
    { text: "Every minute the main server reads new responses; each \"Yes\" becomes a signature for WATHAGA_REF", options: { bullet: true, breakLine: true } },
    { text: "Each new petition signature is sent into the survey", options: { bullet: true, breakLine: true } },
    { text: "Copies coming back are recognised, not counted twice", options: { bullet: true, breakLine: true } },
    { text: "Status: GET /api/wathaga/status", options: { bullet: true } },
  ], { x: 0.5, y: 1.85, w: 4.3, h: 2.9, fontSize: 13, paraSpaceAfter: 6 });
  txt(s, "Android app", { x: 5.2, y: 1.3, w: 4.3, h: 0.45, fontFace: "+mj-lt", fontSize: 24, color: K.rust });
  txt(s, [
    { text: "mobile/ wraps the game with Capacitor; a start screen remembers the game server", options: { bullet: true, breakLine: true } },
    { text: "First build: setup-android.ps1 installs Java 21 and the Android SDK", options: { bullet: true, breakLine: true } },
    { text: "Rebuild: build-apk.cmd puts VoicesRising.apk in Downloads", options: { bullet: true, breakLine: true } },
    { text: "Phones on Wi-Fi need the network set to Private", options: { bullet: true } },
  ], { x: 5.2, y: 1.85, w: 4.3, h: 2.9, fontSize: 13, paraSpaceAfter: 6 });
}

// =============== 14. Going live ===============
{
  const s = content("Developer Guide", "Going live");
  const items = ["Copy .env.example to .env, set strong keys, keep DEV=0", "Run the main server behind https, then each community server",
    "Add a TURN server so live audio works on school and mobile networks", "Have local Elders review and own the Elders' words",
    "Moderators for live events, a chat filter, under-18 consent and a privacy policy", "For the Play Store, build a signed release"];
  items.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.6, y = 1.3 + row * 1.15;
    circleNum(s, i + 1, x, y + 0.1, 0.45, col ? K.teal : K.rust);
    txt(s, t, { x: x + 0.7, y, w: 3.7, h: 0.7, fontSize: 13.5, valign: "middle" });
  });
}

// =============== 15. Wireframes divider ===============
pres.addSection({ title: "Wireframes" });
{
  const s = pres.addSlide({ masterName: "WATHAGA_DARK", sectionTitle: "Wireframes" });
  txt(s, "Wireframes", { x: 0.6, y: 1.6, w: 6, h: 1.1, fontFace: "+mj-lt", fontSize: 54, color: K.white, valign: "middle" });
  txt(s, "The main screens, in the order a new player meets them", { x: 0.6, y: 2.8, w: 6.5, h: 0.4, fontSize: 16, color: K.sand });
  s.addImage({ path: IMG("mark"), x: 7.0, y: 1.2, w: 2.3, h: 2.0 });
}

// ---------- wireframe helpers ----------
const wfScreen = (s, x, y, w, h) => box(s, { x, y, w, h, fill: { color: K.peach }, line: { color: K.charcoal, width: 1.5 }, rectRadius: 0.08 });
const wfBox = (s, x, y, w, h, label, o = {}) => {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.05, fill: { color: o.fill || K.white },
    line: { color: o.line || "8C7F73", width: 1, dashType: o.solid ? "solid" : "dash" } });
  if (label) txt(s, label, { x: x + 0.05, y: y + 0.03, w: w - 0.1, h: h - 0.06, fontSize: o.size || 9, color: o.color || K.ink, bold: !!o.bold, align: o.align || "left", valign: o.valign || "top" });
};
const tag = (s, n, x, y) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: 0.24, h: 0.24, fill: { color: K.teal }, line: { color: K.white, width: 1 } });
  txt(s, String(n), { x, y, w: 0.24, h: 0.24, fontSize: 9, bold: true, color: K.white, align: "center", valign: "middle" });
};
const notes = (s, x, y, w, list) => list.forEach((t, i) => {
  tag(s, i + 1, x, y + i * 0.55);
  txt(s, t, { x: x + 0.35, y: y + i * 0.55 - 0.02, w: w - 0.35, h: 0.5, fontSize: 11 });
});

// =============== 16. HUD wireframe ===============
{
  const s = content("Wireframes", "In-game HUD");
  const X = 0.5, Y = 1.25, W = 5.6, H = 3.5;
  wfScreen(s, X, Y, W, H);
  wfBox(s, X + 0.1, Y + 0.1, 1.6, 1.1, "✊ The Movement\n🔵 640 / 1,000\n✍ 37 signatures", { solid: true, line: K.charcoal });
  wfBox(s, X + 2.3, Y + 0.12, 1.0, 0.26, "BLUE", { fill: K.blue, line: K.blue, color: K.white, bold: true, align: "center", valign: "middle", solid: true });
  s.addShape(pres.shapes.OVAL, { x: X + 4.6, y: Y + 0.1, w: 0.85, h: 0.85, fill: { color: K.white }, line: { color: K.charcoal, width: 1.5 } });
  txt(s, "map", { x: X + 4.6, y: Y + 0.1, w: 0.85, h: 0.85, fontSize: 9, color: K.muted, align: "center", valign: "middle" });
  wfBox(s, X + 1.85, Y + 0.5, 1.9, 0.3, "Toast: rumour at Redfern Park");
  s.addShape(pres.shapes.OVAL, { x: X + 2.65, y: Y + 1.55, w: 0.3, h: 0.3, fill: { color: K.sand }, line: { color: K.charcoal } });
  wfBox(s, X + 1.7, Y + 2.3, 2.2, 0.3, "E  Hold to yarn with the crowd", { fill: K.white, line: K.rust, solid: true, valign: "middle" });
  wfBox(s, X + 0.1, Y + 2.5, 1.6, 0.9, "chat log…\nT to chat");
  wfBox(s, X + 3.6, Y + 3.05, 1.9, 0.35, "Share · Vote · Map · ?", { valign: "middle" });
  tag(s, 1, X + 1.55, Y + 0.05); tag(s, 2, X + 3.35, Y + 0.12); tag(s, 3, X + 4.45, Y + 0.08); tag(s, 4, X + 3.95, Y + 2.33); tag(s, 5, X + 1.4, Y + 2.58); tag(s, 6, X + 3.4, Y + 3.1);
  notes(s, 6.4, 1.3, 3.1, ["Movement board: supporters, signatures, zones", "Role badge: Blue, or Red for spies", "Minimap with real lat/lon",
    "Prompt and hold bar for the nearest action", "Chat log and input", "Share petition, vote, map, help"]);
}

// =============== 17. Three small wireframes ===============
{
  const s = content("Wireframes", "Start screen, stage and vote");
  // App start (phone)
  const px = 0.85, py = 1.25;
  box(s, { x: px, y: py, w: 1.75, h: 3.15, fill: { color: K.peach }, line: { color: K.charcoal, width: 1.5 }, rectRadius: 0.18 });
  wfBox(s, px + 0.15, py + 0.2, 1.45, 0.3, "VOICES RISING", { bold: true, align: "center", valign: "middle" });
  wfBox(s, px + 0.12, py + 0.65, 1.51, 1.6, "Game server address\nhttp://192.168.0.110:3000", { fill: K.white, line: K.rust, solid: true, size: 8 });
  wfBox(s, px + 0.22, py + 1.55, 1.31, 0.28, "Enter the City", { fill: K.rust, line: K.rust, color: K.white, bold: true, align: "center", valign: "middle", solid: true, size: 8 });
  wfBox(s, px + 0.15, py + 2.45, 1.45, 0.5, "Acknowledgement of Country", { size: 8 });
  txt(s, "App start screen", { x: 0.5, y: 4.5, w: 2.5, h: 0.3, fontSize: 12, bold: true, color: K.mob, align: "center" });
  // Stage panel
  const sx = 3.3, sy = 1.25;
  wfScreen(s, sx, sy, 3.1, 3.15);
  wfBox(s, sx + 0.2, sy + 0.15, 2.7, 0.3, "🎤 Town Hall Main Stage", { bold: true, valign: "middle", solid: true, line: K.rust });
  wfBox(s, sx + 0.2, sy + 0.55, 0.85, 0.28, "Speech", { fill: K.rust, line: K.rust, color: K.white, align: "center", valign: "middle", solid: true });
  wfBox(s, sx + 1.12, sy + 0.55, 0.85, 0.28, "Poem", { align: "center", valign: "middle" });
  wfBox(s, sx + 2.05, sy + 0.55, 0.85, 0.28, "Music", { align: "center", valign: "middle" });
  wfBox(s, sx + 0.2, sy + 0.95, 2.7, 0.9, "Your words, one line per row");
  wfBox(s, sx + 0.2, sy + 1.95, 2.7, 0.3, "☐ 🔴 Go Live: stream my voice", { line: K.red, valign: "middle" });
  wfBox(s, sx + 1.5, sy + 2.35, 1.4, 0.3, "Join the line-up", { fill: K.rust, line: K.rust, color: K.white, align: "center", valign: "middle", solid: true });
  wfBox(s, sx + 0.2, sy + 2.75, 2.7, 0.3, "📣 Start the march on Parliament", { fill: K.orange, line: K.orange, align: "center", valign: "middle", solid: true });
  txt(s, "Main Stage panel", { x: sx, y: 4.5, w: 3.1, h: 0.3, fontSize: 12, bold: true, color: K.mob, align: "center" });
  // Vote
  const vx = 6.7, vy = 1.25;
  wfScreen(s, vx, vy, 2.8, 3.15);
  wfBox(s, vx + 0.2, vy + 0.15, 2.4, 0.5, "🔥 Yarning Circle Vote\n32s left · 2/5 voted", { bold: true, solid: true, line: K.rust });
  ["Jarrah", "Mia (your vote)", "Tash", "Skip — not sure yet"].forEach((n, i) =>
    wfBox(s, vx + 0.2, vy + 0.8 + i * 0.52, 2.4, 0.4, n, { valign: "middle", line: i === 1 ? K.blue : "8C7F73", solid: i === 1 }));
  txt(s, "Yarning Circle vote", { x: vx, y: 4.5, w: 2.8, h: 0.3, fontSize: 12, bold: true, color: K.mob, align: "center" });
}

// =============== 18. Close ===============
{
  const s = pres.addSlide({ masterName: "WATHAGA_DARK", sectionTitle: "Wireframes" });
  s.addImage({ path: IMG("logo-neg"), x: 3.6, y: 1.1, w: 2.8, h: 0.89 });
  txt(s, "Go peacefully. Go strong. Look after each other.", { x: 1, y: 2.3, w: 8, h: 0.8, fontFace: "+mj-lt", fontSize: 34, color: K.white, align: "center", valign: "middle" });
  txt(s, "Voices Rising: Sydney · First Nations Youth initiative · Kowa Collaboration", { x: 1, y: 3.2, w: 8, h: 0.4, fontSize: 14, color: K.sand, align: "center" });
}

(async () => {
  const out = "Voices Rising Guide.pptx";
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})();
