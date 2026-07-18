"use client";

/**
 * Sign in with Solana — wallet-provider auth without heavy adapter deps.
 * Uses the injected provider (Phantom/Backpack/Solflare all expose
 * window.solana), asks for a one-time message signature, and persists the
 * proven pubkey. Track eligibility: fans sign up through Solana.
 */

export interface SolSession {
  pubkey: string;
  signedAt: number;
}

const KEY = "terrace-solana";

export function getSession(): SolSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SolSession) : null;
  } catch {
    return null;
  }
}

export function shortPk(pk: string): string {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

export async function signIn(): Promise<SolSession> {
  const provider = (window as any).solana ?? (window as any).phantom?.solana;
  if (!provider) {
    window.open("https://phantom.com/download", "_blank");
    throw new Error("No Solana wallet found — install Phantom, then retry.");
  }
  const { publicKey } = await provider.connect();
  const msg = new TextEncoder().encode(
    `Terrace · sign in\n${publicKey.toString()}\n${new Date().toISOString()}`
  );
  await provider.signMessage(msg, "utf8");
  const session: SolSession = { pubkey: publicKey.toString(), signedAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function signOut() {
  localStorage.removeItem(KEY);
  const provider = (window as any).solana ?? (window as any).phantom?.solana;
  provider?.disconnect?.().catch(() => {});
}
