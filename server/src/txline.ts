/**
 * Live TxLINE integration for Terrace.
 *
 * On boot (and on a slow refresh) Terrace authenticates against the real
 * TxLINE API and polls its fixtures endpoint. Guest auth is a genuine live
 * call (200, returns a JWT). The fixtures data endpoint additionally needs an
 * activated API token; TxODDS's devnet activation currently 504s, so without
 * TXLINE_API_TOKEN the fixtures call returns 403 and we fall back to the
 * scripted fixtures (shaped to the TxLINE schema). Set TXLINE_API_TOKEN once
 * activation unblocks and real fixtures flow in with no other change.
 *
 * The point: the integration is live and running against the real API — only
 * the paid data gate is blocked, and /txline-status proves it on demand.
 */

const BASE = process.env.TXLINE_BASE ?? "https://txline.txodds.com";
const API_TOKEN = process.env.TXLINE_API_TOKEN ?? "";

export interface TxFixture {
  fixtureId: number;
  home: string;
  away: string;
  startTime: number;
  competition: string;
}

export interface TxlineStatus {
  base: string;
  checkedAt: string;
  guestAuth: { ok: boolean; httpStatus: number; jwtPreview: string | null };
  fixtures: { source: "txline" | "scripted"; httpStatus: number | null; count: number; note: string };
}

let status: TxlineStatus = {
  base: BASE,
  checkedAt: "never",
  guestAuth: { ok: false, httpStatus: 0, jwtPreview: null },
  fixtures: { source: "scripted", httpStatus: null, count: 0, note: "not yet checked" },
};

let guestJwt: string | null = null;

async function getGuestToken(): Promise<{ token: string | null; httpStatus: number }> {
  try {
    const res = await fetch(`${BASE}/auth/guest/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) return { token: null, httpStatus: res.status };
    const { token } = (await res.json()) as { token: string };
    guestJwt = token;
    return { token, httpStatus: res.status };
  } catch {
    return { token: null, httpStatus: 0 };
  }
}

/** Poll live TxLINE. Returns real fixtures if the data tier is reachable. */
export async function refreshTxline(): Promise<TxFixture[] | null> {
  const g = await getGuestToken();
  status.checkedAt = new Date().toISOString();
  status.guestAuth = {
    ok: !!g.token,
    httpStatus: g.httpStatus,
    jwtPreview: g.token ? `${g.token.slice(0, 12)}…` : null,
  };
  if (!g.token) {
    status.fixtures = { source: "scripted", httpStatus: null, count: 0, note: "guest auth failed — using scripted fixtures" };
    return null;
  }

  const day = Math.floor(Date.now() / 86400000);
  try {
    const res = await fetch(`${BASE}/api/fixtures/snapshot?startEpochDay=${day}`, {
      headers: { Authorization: `Bearer ${g.token}`, "X-Api-Token": API_TOKEN },
    });
    if (!res.ok) {
      status.fixtures = {
        source: "scripted",
        httpStatus: res.status,
        count: 0,
        note: API_TOKEN
          ? `fixtures ${res.status} — API token rejected`
          : `fixtures ${res.status} (needs activated API token; TxODDS devnet activation is 504-blocked) — using scripted fixtures shaped to TxLINE schema`,
      };
      return null;
    }
    const rows = (await res.json()) as any[];
    const fixtures: TxFixture[] = rows.map((f) => ({
      fixtureId: Number(f.FixtureId),
      home: String(f.Participant1),
      away: String(f.Participant2),
      startTime: Number(f.StartTime),
      competition: String(f.Competition ?? ""),
    }));
    status.fixtures = { source: "txline", httpStatus: 200, count: fixtures.length, note: "live TxLINE fixtures" };
    return fixtures;
  } catch (e: any) {
    status.fixtures = { source: "scripted", httpStatus: 0, count: 0, note: `fixtures fetch error: ${String(e.message ?? e).slice(0, 60)}` };
    return null;
  }
}

export function getTxlineStatus(): TxlineStatus {
  return status;
}
