# Voices Rising: Sydney

A 3D, cel-shaded online adventure for young people aged 15–25. Players meet Elders, connect and collaborate as the **Blue** movement, expose **Red** spies, gather **real petition signatures**, take the **Town Hall Main Stage**, and march through a geo-mapped Sydney (Gadigal Country, Eora Nation) to City Council and Parliament House.

> **Cultural protocol.** All Elder dialogue (`client/data/elders.json`) and the cultural notes (`shared/mapdata.js → INFO_POINTS`) are **placeholders**. Before release, please have local Elders and community organisations (for example the Metropolitan Local Aboriginal Land Council) review, rewrite and own these words. All characters and politicians are fictional.

---

## Architecture

```
            ┌──────────────────────────── MAIN SERVER (you run one) ──────────────────────────┐
 Petition   │  node main-server/server.js   ·  SQLite (node:sqlite)  ·  data/main.db           │
 page  ───▶ │  • player profiles + login tokens      • real signatures (petition / survey SQL)  │
 /petition  │  • shared campaign state (supporters, marches, flag, victory)                     │
 Survey ──▶ │  • stage performance archive (/voices) • abuse reports, bans, CSV export          │
 webhook    └───────────────▲───────────────────────────────▲──────────────────────────────────┘
                            │ x-server-key                  │ x-server-key
              ┌─────────────┴────────────┐     ┌────────────┴─────────────┐
              │ COMMUNITY GAME SERVER A  │     │ COMMUNITY GAME SERVER B  │   ← each mob / school / youth
              │ node game-server/...     │     │ (own SERVER_NAME + key)  │     centre runs their own
              │ WebSocket world, spies,  │     └──────────────────────────┘
              │ votes, marches, stage,   │
              │ WebRTC signalling        │
              └─────────────▲────────────┘
                            │ browser (Three.js)
                          players
```

- Players **log in on their own community server**; the login is proxied to the **main server**, where their profile lives. A token signed by the main server is verified for every game connection.
- **Campaign progress is shared by everyone**: supporters from every community server add up on the main server, and real signatures count everywhere.

## Quick start (local)

Requires **Node.js 22.5+** (uses the built-in `node:sqlite`). No database to install.

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>, create a profile (age 15–25) and play. `npm run dev` starts the main server on :4000 and a community game server on :3000 with `DEV=1` cheats enabled. The petition page is at <http://localhost:4000/petition>.

**DEV chat commands** (only when `DEV=1` on both servers): `/sigs 100` add test signatures · `/sup 1000` add supporters · `/tp 0-4` jump to a zone · `/red` `/blue` switch role · `/skipmarch` finish the current march · `/reset` reset the season.

## Running for real

1. Copy `.env.example` to `.env` and set strong values for `TOKEN_SECRET`, `SERVER_KEYS`, `WEBHOOK_KEY`, `ADMIN_KEY`. Keep `DEV=0`.
2. Main server: `npm run main` (behind HTTPS, e.g. Caddy or nginx).
3. Each community server: set `SERVER_NAME`, `MAIN_SERVER_URL`, `MAIN_PUBLIC_URL` and a `SERVER_KEY` that's listed in the main server's `SERVER_KEYS`, then `npm run game`.
4. **HTTPS is required** for players' microphones (live stage streaming) on anything other than `localhost`.
5. Add a **TURN server** to `ICE_SERVERS` (e.g. coturn) so live audio works on school and mobile networks.

## The game loop

| Step | What players do | Rule (edit in `shared/rules.js`) |
|---|---|---|
| 1. Meet the Elders | Yarn at the fire on **The Block, Redfern**; answer a short culture quiz | Required before joining the movement |
| 2. Grow the movement | Hold **E** in a blue rally ring to win over the crowd; yarn with wandering youth | +100 per rally, +50% per extra player yarning together |
| 3. Expose Red spies | Some players (and some NPCs) are secretly **Red**. They sabotage rallies and heckle the stage. Press **V** to call the **Yarning Circle** vote | Most votes is kicked out of the City (10 min if Red, 2 min if wrongly accused) |
| 4. Lobby with real signatures | Share your personal petition link (✍ button). Real people sign on the main server | **10 signatures** turn a politician red → blue. **100** open the next protest zone |
| 5. March on City Council | At **1,000** supporters, start the march at The Block → Town Hall | Opens the Town Hall Main Stage |
| 6. Town Hall Main Stage | Perform a **speech, poem or music**, with optional **🔴 Go Live** mic streaming. The crowd reacts ✊ ❤ | +60 supporters × (1 + 25% per listener), +2 per reaction |
| 7. The main protest | At **10,000** supporters with Macquarie St open, start the march on Parliament **from the stage** | — |
| 8. The flag | Blues hold **E** together at the Parliament flagpole: the Australian flag comes down, the Aboriginal flag goes up | 10 player-seconds |
| 9. The final vote | Parliament votes: with a **blue majority (6 of 10 MPs)** the Reds are voted out of Parliament | Each MP still needs real signatures |

**Zones** (unlock in order): Redfern — The Block → Central & Prince Alfred Park → Town Hall (City Council & Main Stage) → Hyde Park → Macquarie St (Parliament House).

### Geo-mapping

All places are real `[lat, lon]` coordinates (`shared/mapdata.js`), projected so that 1 unit ≈ 3 m with north up. The HUD shows your live latitude/longitude and suburb. Streets and shorelines are simplified; for more detail, replace `ROADS`, `WATER` and `PARKS` with OpenStreetMap extracts.

### Controls

`WASD` move · `Shift` run · `Space` jump · drag the mouse to look · wheel to zoom · `E` interact (hold to yarn) · `V` vote · `Q` sabotage (Reds) · `T` chat · `1`/`2` react on stage · `M` map · `H` help · `G` graphics quality. Phones get a joystick and buttons.

## Petition / survey integration (SQL)

Signatures are stored in the `signatures` table of `data/main.db`, de-duplicated by email or by name + postcode.

- **Built-in petition page:** `GET /petition?ref=<username>` (credits the player who shared it).
- **External survey tools** (Google Forms, Typeform, Jotform…) can POST to the webhook:

```bash
curl -X POST https://YOUR-MAIN-SERVER/api/signatures/webhook -H "x-webhook-key: $WEBHOOK_KEY" -H "Content-Type: application/json" -d '{"fullName":"Jane Citizen","postcode":"2016","email":"jane@example.com","ref":"playername"}'
```

Google Forms example (Apps Script, *On form submit* trigger):

```js
function onSubmit(e) {
  const v = e.namedValues;
  UrlFetchApp.fetch('https://YOUR-MAIN-SERVER/api/signatures/webhook', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-webhook-key': 'YOUR_WEBHOOK_KEY' },
    payload: JSON.stringify({ fullName: v['Full name'][0], postcode: v['Postcode'][0], email: (v['Email'] || [''])[0], consent: true }),
  });
}
```

**Wathaga survey (pull, works from localhost):** set `WATHAGA_SURVEY_ID`, `WATHAGA_REF` (the player credited) and `WATHAGA_API_KEY` (a key with *Read summaries*, *Read individual rows* and *Send data in*) in `.env`. Every minute the main server fetches new responses, matches the name / postcode / email / "why" / consent questions by their wording, and adds each "Yes" response as a signature. It also works the other way: every petition signature (including earlier ones) is sent into the survey as a response, which needs the key to also have *Send data in*. Check it at `GET /api/wathaga/status`; force a run with `POST /api/admin/wathaga-sync`.

**Admin** (header `x-admin-key`): `GET /api/admin/signatures.csv` · `POST /api/admin/signature-hide {id}` · `GET /api/admin/reports` · `POST /api/admin/voice-hide {id}` · `POST /api/admin/ban {username}` · `POST /api/admin/reset-season`.

## Safety for a 15–25 audience

Many players will be minors. What's built in:

- Age gate (15–25) at sign-up, and community rules that must be accepted.
- Stage listeners can **mute** and **report**. Enough reports (3, or half the audience) **pause a performance automatically**. Every report is logged on the main server for moderators.
- Bans by username, and hiding of signatures or archived performances.
- Live audio only reaches players near the stage, a 🔴 LIVE badge is always shown, and every set has a time limit.

Before going public, I strongly recommend adding: real moderators during live events, a chat word filter, parental-consent wording for under-18s, a privacy policy for the petition data (it holds real names and postcodes), and a moderator "kill switch" for the stage.

## Android app (APK)

`mobile/` is a Capacitor app. It opens a start screen that remembers a game server (default `http://192.168.0.110:3000`, this PC on Wi-Fi), checks it, then loads the game. Players can switch servers with the ⚙ Server button.

- Build: double-click `mobile/build-apk.cmd` (needs the JDK in `%LOCALAPPDATA%VoicesRisingBuildjdk` and the Android SDK in `%LOCALAPPDATA%AndroidSdk`). The APK is written to `mobile/VoicesRising.apk`.
- Phones on Wi-Fi need Windows Firewall to allow Node.js on ports 3000 and 4000.
- Live mic streaming needs the server on **https**; over plain http on Wi-Fi everything else works.
- For the Play Store, build a signed release (`gradlew bundleRelease`) with your own keystore.

## Project layout

```
shared/        rules.js (all numbers) · mapdata.js (geo data) · geo.js (projection) · server-util.js
main-server/   server.js (profiles, signatures, campaign, admin) · public/petition.html · public/voices.html
game-server/   server.js (realtime world, spies, votes, marches, stage, WebRTC signalling)
client/        index.html · css/style.css · data/elders.json
client/js/     main.js (game) · world.js (city) · landmarks.js · characters.js · materials.js · ui.js · live.js
```

## Known limits and next steps

- Live stage audio uses a peer-to-peer mesh (fine for roughly 20 listeners). For big events, move to an SFU such as LiveKit or mediasoup.
- Movement is client-authoritative with a server speed check. Harden it before any competitive play.
- Character and landmark art is procedural. Swap in commissioned models (glTF) — ideally from First Nations artists — for a final art pass.
- Debugging: append `?debug` to the URL; `window.__vr` exposes game state in the console.
