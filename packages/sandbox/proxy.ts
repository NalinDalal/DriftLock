import http from "http";
import https from "https";
import { TrafficCapture } from "./runner";

export interface ProxySafetyConfig {
    /** Methods that always forward to the upstream. Default: safe reads. */
    allowedMethods?: string[];
    /**
     * Exact "METHOD /path" or bare "/path" entries that may forward even
     * though the method is normally intercepted. Nothing mutates upstream
     * unless it is listed here.
     */
    whitelist?: string[];
}

const DEFAULT_ALLOWED_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"];

export class ProxyServer {
    private server: http.Server;
    private captures: TrafficCapture[] = [];
    private port: number;
    private safety: Required<ProxySafetyConfig>;

    constructor(port: number = 8888, safety: ProxySafetyConfig = {}) {
        this.port = port;
        this.safety = {
            allowedMethods: safety.allowedMethods ?? DEFAULT_ALLOWED_METHODS,
            whitelist: safety.whitelist ?? [],
        };
        this.server = this.createServer();
    }

    private createServer(): http.Server {
        return http.createServer((req, res) => {
            this.handleRequest(req, res);
        });
    }

    private matchesWhitelist(method: string, url: string): boolean {
        const { pathname } = new URL(url);
        return this.safety.whitelist.some((entry) => {
            if (entry.startsWith("/")) {
                return pathname === entry;
            }
            return `${method} ${pathname}` === entry ||
                `${method} ${url}` === entry;
        });
    }

    private handleRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ): void {
        const url = req.url || "";
        const method = req.method || "GET";
        const safe =
            this.safety.allowedMethods.includes(method) ||
            this.matchesWhitelist(method, url);

        const capture: TrafficCapture = {
            timestamp: new Date(),
            method,
            url,
            headers: req.headers as Record<string, string>,
        };

        // Blocked mutation: capture the request, never reach the upstream.
        if (!safe) {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", () => {
                const raw = Buffer.concat(chunks).toString("utf8");
                if (raw) {
                    capture.body = this.parsePayload(
                        raw,
                        req.headers["content-type"],
                    );
                }
                capture.intercepted = true;
                this.captures.push(capture);
                res.writeHead(200, { "content-type": "application/json" });
                res.end("{}");
                console.warn(
                    `Proxy intercepted non-idempotent request: ${method} ${url} (not forwarded)`,
                );
            });
            return;
        }

        // Capture the request body while forwarding
        const requestChunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => requestChunks.push(chunk));

        // Forward the request
        const targetUrl = new URL(url);
        const isHttps = targetUrl.protocol === "https:";
        const client = isHttps ? https : http;

        const options = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (isHttps ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method,
            headers: { ...req.headers, connection: "close" },
        };

        const proxyReq = client.request(options, (proxyRes) => {
            // Capture the response
            capture.response = {
                status: proxyRes.statusCode || 0,
                headers: proxyRes.headers as Record<string, string>,
            };

            this.captures.push(capture);

            // Capture the response body while forwarding
            const responseChunks: Buffer[] = [];
            proxyRes.on("data", (chunk: Buffer) => responseChunks.push(chunk));
            proxyRes.on("end", () => {
                const raw = Buffer.concat(responseChunks).toString("utf8");
                if (raw && capture.response) {
                    capture.response.body = this.parsePayload(
                        raw,
                        proxyRes.headers["content-type"],
                    );
                }
            });

            // Forward the response
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on("error", (error) => {
            console.error("Proxy error:", error);
            res.writeHead(502);
            res.end("Bad Gateway");
        });

        req.on("end", () => {
            const raw = Buffer.concat(requestChunks).toString("utf8");
            if (raw) {
                capture.body = this.parsePayload(raw, req.headers["content-type"]);
            }
        });

        // Forward request body
        req.pipe(proxyReq);
    }

    private parsePayload(raw: string, contentType?: string | string[]): unknown {
        const type = Array.isArray(contentType)
            ? contentType.join(",")
            : (contentType ?? "");
        const trimmed = raw.trimStart();
        if (/json/i.test(type) || trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                return JSON.parse(raw);
            } catch {
                // Not valid JSON, fall through
            }
        }
        return raw.length > 1024 * 1024 ? raw.slice(0, 1024 * 1024) : raw;
    }

    start(): Promise<void> {
        return new Promise((resolve) => {
            this.server.listen(this.port, () => {
                const address = this.server.address();
                if (address && typeof address === "object") {
                    this.port = address.port;
                }
                console.log(`Proxy server listening on port ${this.port}`);
                resolve();
            });
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            this.server.close(() => {
                console.log("Proxy server stopped");
                resolve();
            });
        });
    }

    getCaptures(): TrafficCapture[] {
        return [...this.captures];
    }

    clearCaptures(): void {
        this.captures = [];
    }

    getPort(): number {
        return this.port;
    }
}
