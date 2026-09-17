import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createServer, request } from "http";
import type { AddressInfo } from "net";
import { ProxyServer } from "@driftlock/sandbox/proxy";

describe("ProxyServer", () => {
    let server: ProxyServer;

    beforeEach(() => {
        server = new ProxyServer(0); // Use port 0 for test isolation
    });

    afterEach(async () => {
        try {
            await server.stop();
        } catch {
            // Ignore if already stopped
        }
    });

    test("constructor creates instance with default port", () => {
        const defaultServer = new ProxyServer();
        expect(defaultServer).toBeDefined();
        expect(defaultServer.getPort()).toBe(8888);
    });

    test("constructor creates instance with custom port", () => {
        expect(server.getPort()).toBe(0);
    });

    test("start and stop are async functions", () => {
        expect(typeof server.start).toBe("function");
        expect(typeof server.stop).toBe("function");
    });

    test("getCaptures returns empty array initially", () => {
        const captures = server.getCaptures();
        expect(Array.isArray(captures)).toBe(true);
        expect(captures).toHaveLength(0);
    });

    test("getCaptures returns a copy, not the original array", () => {
        const captures1 = server.getCaptures();
        const captures2 = server.getCaptures();
        expect(captures1).not.toBe(captures2);
        expect(captures1).toEqual(captures2);
    });

    test("clearCaptures resets captures array", () => {
        server.clearCaptures();
        expect(server.getCaptures()).toHaveLength(0);
    });

    test("getPort returns the configured port", () => {
        const s1 = new ProxyServer(9999);
        expect(s1.getPort()).toBe(9999);

        const s2 = new ProxyServer(0);
        expect(s2.getPort()).toBe(0);
    });

    test("captures request and response bodies through the proxy", async () => {
        const upstream = await startTestUpstream();
        const proxy = new ProxyServer(0);
        await proxy.start();

        try {
            const proxied = await proxyRequest(
                proxy.getPort(),
                upstream.port,
                "/v1/charges",
                JSON.stringify({
                    amount: 2000,
                    currency: "usd",
                    source: "tok_visa",
                }),
            );
            expect(proxied.status).toBe(201);

            const captures = proxy.getCaptures();
            expect(captures).toHaveLength(1);
            const capture = captures[0];
            expect(capture.method).toBe("POST");
            expect(capture.body).toEqual({
                amount: 2000,
                currency: "usd",
                source: "tok_visa",
            });
            expect(capture.response?.body).toEqual({
                id: "ch_1",
                status: "succeeded",
            });
            expect(capture.url).toContain("/v1/charges");
        } finally {
            await proxy.stop();
            await upstream.close();
        }
    });
});

interface TestUpstream {
    port: number;
    close: () => Promise<void>;
}

function startTestUpstream(): Promise<TestUpstream> {
    const server = createServer((req, res) => {
        req.resume();
        req.on("end", () => {
            res.writeHead(201, {
                "content-type": "application/json",
                connection: "close",
            });
            res.end(
                JSON.stringify({
                    id: "ch_1",
                    status: "succeeded",
                }),
            );
        });
    });
    return new Promise((resolve) => {
        server.listen(0, () => {
            const { port } = server.address() as AddressInfo;
            resolve({
                port,
                close: () =>
                    new Promise<void>((done) => server.close(() => done())),
            });
        });
    });
}

function proxyRequest(
    proxyPort: number,
    upstreamPort: number,
    path: string,
    body: string,
): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
        const req = request(
            {
                hostname: "127.0.0.1",
                port: proxyPort,
                method: "POST",
                path: `http://127.0.0.1:${upstreamPort}${path}`,
                headers: { "content-type": "application/json" },
            },
            (res) => {
                res.resume();
                res.on("end", () =>
                    resolve({ status: res.statusCode ?? 0 }),
                );
            },
        );
        req.on("error", reject);
        req.end(body);
    });
}
