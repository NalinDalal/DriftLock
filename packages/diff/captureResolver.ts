import type { CallSite } from "@driftlock/core";

/**
 * Minimum shape of a sandbox traffic entry. Structural: any capture type
 * with method, url and optional JSON payloads satisfies it.
 */
export interface CaptureLike {
    method: string;
    url: string;
    body?: unknown;
    response?: {
        body?: unknown;
    };
}

/** What a capture-based fill resolved for one unknown-vendor call site. */
export interface EndpointFill {
    endpoint: string;
    httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    requestFields: string[];
    responseFields: string[];
}

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

/**
 * True when a capture belongs to a call site with a known endpoint.
 * Path segments starting with ":" act as wildcards.
 *
 * @param capture - Captured HTTP request.
 * @param callSite - Extracted call site; needs a resolved endpoint.
 * @returns False when the site is unresolved or the shapes mismatch.
 */
export function matchesCapture(
    capture: CaptureLike,
    callSite: CallSite,
): boolean {
    if (callSite.endpoint === undefined) {
        return false;
    }
    if (capture.method !== callSite.httpMethod) {
        return false;
    }
    const pathname = capturePathname(capture.url);
    if (!pathname) {
        return false;
    }
    const expected = callSite.endpoint.split("/");
    const actual = pathname.split("/");
    if (expected.length !== actual.length) {
        return false;
    }
    return expected.every(
        (segment, index) =>
            segment.startsWith(":") || segment === actual[index],
    );
}

/**
 * Fill endpoints and HTTP verbs for call sites the parser could not resolve
 * (unknown vendors), using captured traffic as ground truth. Correlation is
 * payload-driven: request and response field overlap between the code and
 * the capture. A capture already claimed by a known endpoint is reserved.
 *
 * @param callSites - Extracted call sites, some with undefined endpoints.
 * @param captures - Traffic captured by a sandbox run.
 * @returns An endpoint fill per call-site id; only occurrences with a real
 * field match and a valid HTTP verb are resolved.
 */
export function resolveCapturedEndpoints(
    callSites: CallSite[],
    captures: CaptureLike[],
): Map<string, EndpointFill> {
    const reserved = new Set<number>();

    for (const site of callSites) {
        if (site.endpoint === undefined) {
            continue;
        }
        for (let i = 0; i < captures.length; i++) {
            if (matchesCapture(captures[i], site)) {
                reserved.add(i);
            }
        }
    }

    const fills = new Map<string, EndpointFill>();

    for (const site of callSites) {
        if (site.endpoint !== undefined) {
            continue;
        }
        const pick = bestCapture(site, captures, reserved);
        if (!pick) {
            continue;
        }
        const httpMethod = asHttpMethod(pick.capture.method);
        if (!httpMethod) {
            continue;
        }
        const endpoint = pathPattern(pick.capture, captures);
        if (!endpoint) {
            continue;
        }
        reserved.add(pick.index);
        fills.set(site.id, {
            endpoint,
            httpMethod,
            requestFields: objectFields(pick.capture.body),
            responseFields: objectFields(pick.capture.response?.body),
        });
    }

    return fills;
}

function bestCapture(
    site: CallSite,
    captures: CaptureLike[],
    reserved: Set<number>,
): { index: number; capture: CaptureLike; score: number } | null {
    let best: { index: number; capture: CaptureLike; score: number } | null =
        null;

    for (let i = 0; i < captures.length; i++) {
        if (reserved.has(i)) {
            continue;
        }
        const score = overlapScore(site, captures[i]);
        if (score === 0) {
            continue;
        }
        if (!best || score > best.score) {
            best = { index: i, capture: captures[i], score };
        }
    }

    return best;
}

function overlapScore(site: CallSite, capture: CaptureLike): number {
    const requestKeys = new Set(Object.keys(site.requestShape ?? {}));
    const requestHits = countHits(requestKeys, objectFields(capture.body));
    const responseHits = countHits(
        new Set(site.responseFields),
        objectFields(capture.response?.body),
    );
    return requestHits + responseHits;
}

function countHits(expected: Set<string>, actual: string[]): number {
    let hits = 0;
    for (const key of actual) {
        if (expected.has(key)) {
            hits += 1;
        }
    }
    return hits;
}

function pathPattern(
    capture: CaptureLike,
    captures: CaptureLike[],
): string | null {
    const host = captureHost(capture.url);
    const pathname = capturePathname(capture.url);
    if (!host || !pathname) {
        return null;
    }

    const width = pathSegments(pathname).length;
    if (width === 0) {
        return null;
    }

    const group = captures
        .filter(
            (c) =>
                captureHost(c.url) === host && c.method === capture.method,
        )
        .map((c) => pathSegments(capturePathname(c.url) ?? ""));
    const slots: string[] = [];

    for (let i = 0; i < width; i++) {
        const values = new Set(
            group.map((segments) => segments[i]).filter((v) => v !== undefined),
        );
        slots.push(values.size > 1 ? ":id" : pathSegments(pathname)[i]);
    }

    return `/${slots.join("/")}`;
}

function capturePathname(url: string): string | null {
    try {
        return new URL(url).pathname;
    } catch {
        return null;
    }
}

function captureHost(url: string): string | null {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

function pathSegments(pathname: string): string[] {
    return pathname.split("/").filter(Boolean);
}

function objectFields(value: unknown): string[] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return [];
    }
    return Object.keys(value);
}

function asHttpMethod(
    value: string,
): EndpointFill["httpMethod"] | null {
    return (HTTP_METHODS as readonly string[]).includes(value)
        ? (value as EndpointFill["httpMethod"])
        : null;
}