import type { Metadata } from "next";
import { LiveRoom } from "@/components/LiveRoom";

const HTTP_BASE = process.env.TERRACE_HTTP ?? "http://localhost:8787";

/** Shared room links get a real title ("Spain v Argentina · Terrace"). */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const res = await fetch(`${HTTP_BASE}/matches`);
    const { matches } = (await res.json()) as { matches: { id: string; home: string; away: string }[] };
    const m = matches.find((x) => x.id === params.id);
    if (m) {
      const title = `${m.home} v ${m.away}`;
      return {
        title,
        openGraph: { title: `${title} · Terrace`, images: [{ url: "/og.png", width: 1200, height: 630 }] },
        twitter: { card: "summary_large_image", title: `${title} · Terrace` },
      };
    }
  } catch {
    /* live server unreachable at render time — fall back to the default title */
  }
  return { title: "Live match" };
}

export function generateStaticParams() {
  return ["esp-arg", "eng-ger", "bra-fra", "por-ned"].map((id) => ({ id }));
}

export default function MatchPage({ params }: { params: { id: string } }) {
  return <LiveRoom matchId={params.id} />;
}
