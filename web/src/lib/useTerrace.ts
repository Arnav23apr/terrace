"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchState, MatchEvent, RoomState, Poll, PollResult } from "./types";

const WS_URL = process.env.NEXT_PUBLIC_TERRACE_WS ?? "ws://localhost:8787/ws";

type Handlers = {
  onReact?: (r: { emoji: string; from: string; side: number }) => void;
  onEvent?: (e: { matchId: string; event: MatchEvent; match: MatchState }) => void;
  onPoll?: (p: Poll) => void;
  onPollResult?: (r: PollResult) => void;
};

/**
 * One socket to the Terrace server. Exposes the match list + (when joined) the
 * live match state and room state as React state, and routes transient events
 * (reactions, goals, polls) through stable handler refs so high-frequency
 * messages never trigger a full re-render.
 */
export function useTerrace(handlers: Handlers = {}) {
  const [connected, setConnected] = useState(false);
  const [matches, setMatches] = useState<MatchState[]>([]);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const h = useRef(handlers);
  h.current = handlers;
  const joinRef = useRef<{ room: string; matchId: string; name: string; side: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!alive) return;
        setConnected(true);
        const j = joinRef.current;
        if (j) {
          ws.send(JSON.stringify({ t: "hello", name: j.name }));
          ws.send(JSON.stringify({ t: "join", room: j.room, matchId: j.matchId, side: j.side }));
        }
      };
      ws.onclose = () => { if (!alive) return; setConnected(false); retry = setTimeout(connect, 1200); };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        let m: any;
        try { m = JSON.parse(ev.data); } catch { return; }
        switch (m.t) {
          case "matches": setMatches(m.matches); break;
          case "match": setMatch(m.match); setMatches((cur) => cur.map((x) => (x.id === m.match.id ? m.match : x))); break;
          case "room": setRoom({ count: m.count, members: m.members, hypeHome: m.hypeHome, hypeAway: m.hypeAway }); break;
          case "react": h.current.onReact?.(m); break;
          case "event": h.current.onEvent?.(m); setMatches((cur) => cur.map((x) => (x.id === m.match.id ? m.match : x))); break;
          case "poll": h.current.onPoll?.(m); break;
          case "pollResult": h.current.onPollResult?.(m); break;
        }
      };
    };
    connect();
    return () => { alive = false; clearTimeout(retry); wsRef.current?.close(); };
  }, []);

  const send = useCallback((msg: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const join = useCallback((roomId: string, matchId: string, name: string, side: number) => {
    joinRef.current = { room: roomId, matchId, name, side };
    send({ t: "hello", name });
    send({ t: "join", room: roomId, matchId, side });
  }, [send]);

  const react = useCallback((emoji: string) => send({ t: "react", emoji }), [send]);
  const setSide = useCallback((side: number) => {
    if (joinRef.current) joinRef.current.side = side;
    send({ t: "setSide", side });
  }, [send]);
  const vote = useCallback((pollId: string, option: number) => send({ t: "pollVote", pollId, option }), [send]);

  return { connected, matches, match, room, join, react, setSide, vote };
}
