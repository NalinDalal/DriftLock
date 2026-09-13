import { describe, expect, test, beforeEach, afterEach } from "bun:test";
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
});
