/**
 * Match model + scripted timelines. The engine replays these on an accelerated
 * clock so a full 90' plays in ~90s for the demo. In production the same shape
 * is fed by the TxLINE live scores/events stream instead of a script.
 */

export type EventType = "kickoff" | "goal" | "yellow" | "red" | "chance" | "ht" | "ft";

export interface MatchEvent {
  min: number;
  type: EventType;
  team?: 0 | 2; // home | away
  player?: string;
  text: string;
  /** win probability [home, draw, away] the instant after this event */
  prob?: [number, number, number];
}

export interface MatchDef {
  id: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  group: string;
  venue: string;
  kickoffOffsetSec: number; // seconds from server start until kickoff
  preProb: [number, number, number];
  timeline: MatchEvent[]; // must end with an "ft"
}

export interface MatchState {
  id: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  group: string;
  venue: string;
  status: "upcoming" | "live" | "ft";
  minute: number;
  added: number; // stoppage minutes shown as 45+x / 90+x
  half: 1 | 2;
  score: [number, number];
  prob: [number, number, number];
  kickoffInSec: number; // >0 if upcoming
  lastEvent?: MatchEvent;
  predictors: number; // simulated social proof
  watching: number;   // live presence from rooms (filled by server)
}

// realistic-sounding invented names (avoid real-player trademarks)
const M = (min: number, type: EventType, opts: Partial<MatchEvent> = {}): MatchEvent => ({
  min, type, text: "", ...opts,
});

export const MATCHES: MatchDef[] = [
  {
    id: "esp-arg",
    home: "Spain", away: "Argentina", homeCode: "ESP", awayCode: "ARG",
    group: "Group C", venue: "MetLife Stadium",
    kickoffOffsetSec: 6, // kicks off shortly after boot → the marquee live game
    preProb: [42, 27, 31],
    timeline: [
      M(0, "kickoff", { text: "We are under way in New Jersey." }),
      M(9, "chance", { team: 0, player: "R. Belmonte", text: "Belmonte curls it inches wide for Spain." }),
      M(14, "goal", { team: 0, player: "R. Belmonte", text: "SPAIN LEAD! Belmonte sweeps it home.", prob: [63, 22, 15] }),
      M(28, "yellow", { team: 2, player: "M. Ferreyra", text: "Ferreyra booked for a late lunge." }),
      M(37, "goal", { team: 2, player: "J. Otamendez", text: "ARGENTINA LEVEL! Otamendez rises highest.", prob: [40, 30, 30] }),
      M(45, "ht", { text: "Half time. Spain 1, Argentina 1." }),
      M(58, "chance", { team: 2, player: "L. Parediaz", text: "Parediaz stings the palms of the keeper." }),
      M(64, "goal", { team: 2, player: "L. Parediaz", text: "ARGENTINA IN FRONT! Parediaz with a screamer.", prob: [22, 24, 54] }),
      M(79, "goal", { team: 0, player: "A. Villaró", text: "SPAIN RESPOND! Villaró bundles it in. Level again!", prob: [33, 34, 33] }),
      M(88, "red", { team: 0, player: "D. Sanmartín", text: "Spain down to ten! Sanmartín sees red.", prob: [24, 30, 46] }),
      M(90, "ft", { text: "Full time. A classic ends Spain 2, Argentina 2." }),
    ],
  },
  {
    id: "eng-ger",
    home: "England", away: "Germany", homeCode: "ENG", awayCode: "GER",
    group: "Group D", venue: "AT&T Stadium",
    kickoffOffsetSec: 40, // starts a bit later so there are two live games in a demo
    preProb: [36, 33, 31],
    timeline: [
      M(0, "kickoff", { text: "Kickoff in Dallas." }),
      M(18, "goal", { team: 0, player: "T. Ashworth", text: "ENGLAND! Ashworth pounces on a loose ball.", prob: [58, 27, 15] }),
      M(41, "yellow", { team: 0, player: "K. Rowntree", text: "Rowntree into the book." }),
      M(45, "ht", { text: "Half time. England 1, Germany 0." }),
      M(70, "goal", { team: 2, player: "S. Brandtner", text: "GERMANY EQUALISE! Brandtner drills it low.", prob: [34, 33, 33] }),
      M(84, "goal", { team: 2, player: "F. Kowalczyk", text: "GERMANY AHEAD LATE! Kowalczyk with ice in his veins.", prob: [16, 22, 62] }),
      M(90, "ft", { text: "Full time. Germany snatch it, 2-1." }),
    ],
  },
  {
    id: "bra-fra",
    home: "Brazil", away: "France", homeCode: "BRA", awayCode: "FRA",
    group: "Group A", venue: "SoFi Stadium",
    kickoffOffsetSec: 3600 * 3, // upcoming (3h out)
    preProb: [45, 27, 28],
    timeline: [M(0, "kickoff", { text: "" }), M(90, "ft", { text: "" })],
  },
  {
    id: "por-ned",
    home: "Portugal", away: "Netherlands", homeCode: "POR", awayCode: "NED",
    group: "Group F", venue: "Levi's Stadium",
    kickoffOffsetSec: 3600 * 6,
    preProb: [38, 31, 31],
    timeline: [M(0, "kickoff", { text: "" }), M(90, "ft", { text: "" })],
  },
];

/** Seed predictor counts (organic, not round). */
export const SEED_PREDICTORS: Record<string, number> = {
  "esp-arg": 27584, "eng-ger": 19213, "bra-fra": 41027, "por-ned": 8842,
};
