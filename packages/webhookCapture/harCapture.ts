/**
 * HAR → consumer contract — inspired by SpecShield `bdct capture from-har`
 * Source: https://github.com/specshield-io/specshield-cli#bdct-capture-from-har
 * What to adapt: turn real test traffic (HAR) into an OpenAPI consumer contract, no Pact DSL.
 * How in DriftLock: reuses schemaFlattener + schemaDiff, path templating, per-status merging.
 * Where: packages/webhookCapture/harCapture.ts, used by CLI `driftlock capture --har`
 */

export interface HarCaptureOptions {
  baseUrl?: string;
  includeNonJson?: boolean;
}

export interface HarEntry {
  request: { url: string; method: string };
  response: { status: number; content: { mimeType: string; text?: string } };
}

function templatedPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/\d+/g, "/{id}").replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-/g, "/{uuid}-");
  } catch {
    return url;
  }
}

export function harToConsumerContract(har: { log: { entries: HarEntry[] } }, opts: HarCaptureOptions = {}) {
  const filtered = har.log.entries.filter((e) => {
    if (opts.baseUrl && !e.request.url.startsWith(opts.baseUrl)) return false;
    if (!opts.includeNonJson && !e.response.content.mimeType.includes("json")) return false;
    return true;
  });

  const endpoints = new Map<string, { methods: Set<string>; samples: number }>();
  for (const e of filtered) {
    const path = templatedPath(e.request.url);
    const key = `${e.request.method} ${path} ${e.response.status}`;
    const cur = endpoints.get(key) ?? { methods: new Set(), samples: 0 };
    cur.methods.add(e.request.method);
    cur.samples++;
    endpoints.set(key, cur);
  }

  return {
    endpoints: [...endpoints.entries()].map(([k, v]) => ({ key: k, samples: v.samples })),
    stats: { total: har.log.entries.length, kept: filtered.length },
  };
}
