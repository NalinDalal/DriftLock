import { describe, expect, test } from "bun:test";
import { SandboxRunner } from "@driftlock/sandbox";
import type { SandboxConfig } from "@driftlock/sandbox";

describe("SandboxRunner integration", () => {
    test("SandboxConfig type accepts valid Docker images", () => {
        const configs: SandboxConfig[] = [
            {
                image: "node:20-slim",
                command: ["node", "-e", "console.log('hello')"],
                env: {},
                timeout: 10000,
                memoryLimit: "256m",
                cpuLimit: 0.5,
                networkEnabled: false,
                allowedEndpoints: [],
            },
            {
                image: "python:3.11-slim",
                command: ["python", "-c", "print('hello')"],
                env: { PYTHONUNBUFFERED: "1" },
                timeout: 30000,
                memoryLimit: "1g",
                cpuLimit: 2.0,
                networkEnabled: true,
                allowedEndpoints: ["api.stripe.com:443"],
            },
        ];

        for (const config of configs) {
            expect(config.image).toBeTruthy();
            expect(config.command.length).toBeGreaterThan(0);
            expect(config.timeout).toBeGreaterThan(0);
        }
    });

    test("SandboxRunner can be instantiated multiple times", () => {
        const runners = Array.from({ length: 3 }, () => new SandboxRunner());
        expect(runners).toHaveLength(3);
        for (const runner of runners) {
            expect(runner).toBeDefined();
        }
    });
});
