// Overpass, shared by the snapshot and the evaluation context fetch. The main server is often busy (504 or 429),
// so each round tries every mirror in turn, and a few rounds run with a growing pause between them.
// The servers refuse requests without a User-Agent.

export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export type OverpassOptions = {
  userAgent: string;
  /** Treat an answer with no elements as a failure: a busy server, or a mirror without the suburb areas, can send one. */
  nonEmpty?: boolean;
  rounds?: number;
  /** The pause before round n is n times this. */
  pauseMs?: number;
};

/** The elements an Overpass query returns, from the first mirror that answers properly. */
export async function overpass(query: string, { userAgent, nonEmpty = false, rounds = 4, pauseMs = 20e3 }: OverpassOptions): Promise<any[]> {
  const errors: string[] = [];
  for (let round = 0; round < rounds; round++) {
    if (round) await new Promise((r) => setTimeout(r, pauseMs * round));
    for (const url of OVERPASS_MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": userAgent, Accept: "application/json" },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(200_000),
        });
        // A server can answer 200 with an error remark in place of the elements.
        const body = res.ok ? ((await res.json()) as { remark?: string; elements?: any[] }) : null;
        if (body && !/error/i.test(body.remark ?? "") && (!nonEmpty || body.elements?.length)) return body.elements ?? [];
        errors.push(`${url}: ${res.status} ${body?.remark ?? ""}`);
      } catch (e) { errors.push(`${url}: ${e}`); }
    }
  }
  throw new Error(`Overpass failed: ${errors.join(", ")}`);
}
