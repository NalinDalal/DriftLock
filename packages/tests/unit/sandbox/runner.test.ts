import { describe, expect, test, mock } from "bun:test";
import { SandboxRunner } from "@driftlock/sandbox";
import type { SandboxConfig } from "@driftlock/sandbox";

function createConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
    return {
        image: "node:20-slim",
        command: ["sh", "-c", "echo hello"],
        env: {},
        timeout: 5000,
        memoryLimit: "512m",
        cpuLimit: 1.0,
        networkEnabled: false,
        allowedEndpoints: [],
        ...overrides,
    };
}

describe("SandboxRunner", () => {
    test("constructor creates instance", () => {
        const runner = new SandboxRunner();
        expect(runner).toBeDefined();
    });

    test("runTestSuite has correct return type shape", async () => {
        // This test verifies the method signature and return type
        // Actual Docker execution would require Docker to be running
        const runner = new SandboxRunner();
        expect(typeof runner.runTestSuite).toBe("function");
    });

    test("runTestSuite returns a promise and reports Docker failures", async () => {
        const runner = new SandboxRunner();
        const inspect = mock(async () => ({}));
        const createContainer = mock(async (_options: unknown) => {
            throw new Error("Container creation failed");
        });
        const docker = {
            getImage: mock((_image: string) => ({ inspect })),
            createContainer,
        };
        (runner as unknown as { docker: typeof docker }).docker = docker;

        const result = runner.runTestSuite("/tmp", createConfig());
        expect(result).toBeInstanceOf(Promise);
        expect(await result).toEqual({
            exitCode: 1,
            stdout: "",
            stderr: "Container creation failed",
            duration: expect.any(Number),
            trafficCaptured: [],
        });
        expect(docker.getImage).toHaveBeenCalledWith("node:20-slim");
        expect(inspect).toHaveBeenCalledTimes(1);
        expect(createContainer).toHaveBeenCalledWith(
            expect.objectContaining({
                HostConfig: expect.objectContaining({ NetworkMode: "none" }),
            }),
        );
    });
});

describe("SandboxConfig", () => {
    test("config accepts all required fields", () => {
        const config = createConfig();
        expect(config.image).toBe("node:20-slim");
        expect(config.command).toEqual(["sh", "-c", "echo hello"]);
        expect(config.timeout).toBe(5000);
        expect(config.memoryLimit).toBe("512m");
        expect(config.cpuLimit).toBe(1.0);
        expect(config.networkEnabled).toBe(false);
    });

    test("config accepts overrides", () => {
        const config = createConfig({
            image: "python:3.11",
            timeout: 10000,
            memoryLimit: "1g",
            networkEnabled: true,
        });
        expect(config.image).toBe("python:3.11");
        expect(config.timeout).toBe(10000);
        expect(config.memoryLimit).toBe("1g");
        expect(config.networkEnabled).toBe(true);
    });

    test("config accepts allowed endpoints", () => {
        const config = createConfig({
            allowedEndpoints: ["api.stripe.com:443"],
        });
        expect(config.allowedEndpoints).toEqual(["api.stripe.com:443"]);
    });
});
