import Docker from "dockerode";

export interface SandboxConfig {
    image: string;
    command: string[];
    env: Record<string, string>;
    timeout: number; // in milliseconds
    memoryLimit: string; // e.g., '512m'
    cpuLimit: number; // e.g., 1.0 for one CPU
    networkEnabled: boolean;
    allowedEndpoints: string[]; // e.g., ['api.stripe.com:443']
}

export interface SandboxResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    trafficCaptured: TrafficCapture[];
}

export interface TrafficCapture {
    timestamp: Date;
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
    response?: {
        status: number;
        headers: Record<string, string>;
        body?: unknown;
    };
}

export class SandboxRunner {
    private docker: Docker;

    constructor() {
        this.docker = new Docker();
    }

    async runTestSuite(
        repoPath: string,
        config: SandboxConfig,
    ): Promise<SandboxResult> {
        const startTime = Date.now();
        let container: Docker.Container | null = null;

        try {
            // Build or pull the sandbox image
            await this.ensureImage(config.image);

            // Create container
            container = await this.docker.createContainer({
                Image: config.image,
                Cmd: config.command,
                WorkingDir: "/workspace",
                Env: Object.entries(config.env).map(
                    ([key, value]) => `${key}=${value}`,
                ),
                HostConfig: {
                    Binds: [`${repoPath}:/workspace:ro`],
                    Memory: this.parseMemoryLimit(config.memoryLimit),
                    NanoCpus: config.cpuLimit * 1e9,
                    NetworkMode: config.networkEnabled ? "bridge" : "none",
                },
            });

            // Start container
            await container.start();

            // Wait for completion with timeout
            const result = await Promise.race([
                this.waitForContainer(container),
                this.createTimeout(config.timeout),
            ]);

            const duration = Date.now() - startTime;

            return {
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
                duration,
                trafficCaptured: [], // Would be populated by proxy
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            return {
                exitCode: 1,
                stdout: "",
                stderr:
                    error instanceof Error ? error.message : "Unknown error",
                duration,
                trafficCaptured: [],
            };
        } finally {
            if (container) {
                try {
                    await container.remove({ force: true });
                } catch {
                    // Ignore cleanup errors
                }
            }
        }
    }

    private async ensureImage(image: string): Promise<void> {
        try {
            await this.docker.getImage(image).inspect();
        } catch {
            // Image doesn't exist, pull it
            await this.docker.pull(image);
        }
    }

    private async waitForContainer(container: Docker.Container): Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
    }> {
        const stream = await container.attach({
            stream: true,
            stdout: true,
            stderr: true,
        });

        let stdout = "";
        let stderr = "";

        return new Promise((resolve) => {
            stream.on("data", (chunk: Buffer) => {
                const output = chunk.toString();
                stdout += output;
            });

            stream.on("error", (error: Error) => {
                stderr += error.message;
            });

            stream.on("end", async () => {
                const info = await container.inspect();
                resolve({
                    exitCode: info.State.ExitCode,
                    stdout,
                    stderr,
                });
            });
        });
    }

    private createTimeout(ms: number): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Sandbox timed out after ${ms}ms`));
            }, ms);
        });
    }

    private parseMemoryLimit(limit: string): number {
        const match = limit.match(/^(\d+)(m|g)$/i);
        if (!match) {
            return 512 * 1024 * 1024; // Default 512MB
        }

        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();

        if (unit === "g") {
            return value * 1024 * 1024 * 1024;
        }
        return value * 1024 * 1024;
    }
}
