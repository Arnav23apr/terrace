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
  added: number;
  half: 1 | 2;
  score: [number, number];
  prob: [number, number, number];
  kickoffInSec: number;
  predictors: number;
  watching: number;
}

export interface MatchEvent {
  min: number;
  type: "kickoff" | "goal" | "yellow" | "red" | "chance" | "ht" | "ft";
  team?: 0 | 2;
  player?: string;
  text: string;
}

export interface RoomMember { name: string; side: -1 | 0 | 2; }
export interface RoomState { count: number; members: RoomMember[]; hypeHome: number; hypeAway: number; }
export interface Poll { id: string; q: string; options: string[]; closesInMs: number; }
export interface PollResult { id: string; options: string[]; counts: number[]; total: number; }

export const REACTIONS = [
  { id: "fire", glyph: "🔥" },
  { id: "goal", glyph: "⚽" },
  { id: "shock", glyph: "😱" },
  { id: "clap", glyph: "👏" },
  { id: "laugh", glyph: "😂" },
  { id: "angry", glyph: "🤬" },
] as const;
