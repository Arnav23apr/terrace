# Terrace — watch the World Cup with the whole terrace

**Consumer & Fan Experiences entry · TxODDS × Superteam World Cup Hackathon**

A live watch-along for the 2026 World Cup: join a match room, pick your end, react with the crowd in real time, call the next goal in live polls, and out-sing the other end on the rivalry scarf — on the site or in a floating browser-extension widget over any stream. Results land proof-verified from the on-chain TxLINE feed.

> **Submission links** · Demo video: _in submission form_ · Live app: _in submission form_
> Fans **sign up through Solana**: wallet sign-in (Phantom/Backpack/Solflare message signature) is the account.

## Why a fan opens it every match

- **The room feels alive in 5 seconds** — presence orbit of who's watching, emoji bursts with real physics, a knitted rivalry scarf that pulls toward the louder end, and a broadcast-grade GOAL takeover with the new score.
- **Spoiler Shield** — streams run 20–80s behind the data feed, so second screens normally score before your TV. Terrace lets you delay match events (15/30/60s) so it celebrates *with* your TV, not before it. No incumbent does this.
- **One-link join** — no account needed to watch; Solana sign-in claims your identity across rooms.
- **The widget** — an MV3 extension floats a draggable liquid-glass mini-room over whatever site is streaming your match: live score, reactions, goal flashes, notifications.

## Real-time architecture

```
server/   Node + ws · match-replay engine on an accelerated clock · rooms, presence,
          reactions, hype decay, auto polls · scripted timelines with prob snapshots
web/      Next.js 14 hub + live room · broadcast design system (score bug, ticker,
          TV rundown, Tanker display face, scarf) · WS client with transient handlers
extension/ MV3 content-script widget (shadow DOM) + service-worker notifications
```

Match data is a deterministic replay of scripted fixtures (matches replay on a loop for the demo). The event schema mirrors TxLINE's soccer feed — kickoff/goal/cards/VAR/HT/FT with probability snapshots — so the replay engine swaps for the live SSE stream (`GET /api/scores/stream`) without touching the client.

## TxLINE integration

| Endpoint | Use |
|---|---|
| `GET /api/fixtures/snapshot` | fixture list, kickoff times |
| `GET /api/scores/stream` (SSE) | live event feed the replay engine mirrors |
| `GET /api/scores/stat-validation` | Merkle proofs — "proof-verified results" chain of custody |

**Honest note:** devnet API activation currently 504s on the TxODDS side (our subscribe tx is in the sibling Markets repo README), so rooms run on the labelled replay engine. The "results verified on-chain" trust chain is delivered by our Markets entry's settlement program; Terrace consumes the same fixture identity.

## Run it

```bash
cd server && npm i && MIN_PER_SEC=2 REPLAY_GAP_SEC=15 npx ts-node --transpile-only src/server.ts   # ws on :8787
cd web && npm i && npm run dev                                                                      # hub on :3000
# extension: chrome://extensions → Load unpacked → ./extension (test page: extension/test/watch.html)
```

## Monetization path

Free to watch. Revenue: club/creator-branded rooms (badges, scarf skins), sponsor-clean goal moments (one tasteful partner card at FT, never mid-play), and premium multi-match "gantry view" for the group stage. The wallet account makes badges/skins ownable assets later without changing the product.
