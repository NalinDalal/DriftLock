import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { TypeScriptExtractor, detectLanguage } from "@driftlock/parser";
import { SandboxRunner } from "@driftlock/sandbox";
import { resolveCapturedEndpoints, type EndpointFill } from "@driftlock/diff";
import type { CallSite } from "@driftlock/core";
import type { SnapshotStore, CapturedShapes } from "./snapshots";
import {
    buildDriftResult,
    extractShapesFromCaptures,
    type DriftResult,
} from "./drift";

export interface AnalyzeInput {
    repoPath: string;
    command: string;
    forward?: string[];
    timeoutMs?: number;
    snapshotStore: SnapshotStore;
}

export interface AnalyzeResult {
    callSites: CallSite[];
    fills: Map<string, EndpointFill>;
    shapes: Map<string, CapturedShapes>;
    baselines: CallSite[];
    drifts: DriftResult[];
    exitCode: number;
    duration: number;
    trafficCaptured: number;
}

export async function analyzeAndCompare(
    input: AnalyzeInput,
): Promise<AnalyzeResult> {
    const callSites = await scanCallSites(input.repoPath);
    if (callSites.length === 0) {
        return {
            callSites,
            fills: new Map(),
            shapes: new Map(),
            baselines: [],
            drifts: [],
            exitCode: 0,
            duration: 0,
            trafficCaptured: 0,
        };
    }

    const runner = new SandboxRunner();
    const sandbox = await runner.runTestSuite(input.repoPath, {
        image: "node:20-slim",
        command: ["sh", "-c", input.command],
        env: {},
        timeout: input.timeoutMs ?? 300000,
        memoryLimit: "512m",
        cpuLimit: 1.0,
        networkEnabled: true,
        allowedEndpoints: [],
        safety: { whitelist: input.forward ?? [] },
    });

    const fills = resolveCapturedEndpoints(
        callSites,
        sandbox.trafficCaptured,
    );
    for (const callSite of callSites) {
        const fill = fills.get(callSite.id);
        if (fill) {
            callSite.endpoint = fill.endpoint;
            callSite.httpMethod = fill.httpMethod;
        }
    }

    const shapes = extractShapesFromCaptures(
        sandbox.trafficCaptured,
        callSites,
    );

    const baselines: CallSite[] = [];
    const drifts: DriftResult[] = [];
    const meta = {
        testCommand: input.command,
        exitCode: sandbox.exitCode,
        duration: sandbox.duration,
        trafficCaptured: sandbox.trafficCaptured.length,
    };
    for (const callSite of callSites) {
        const current = shapes.get(callSite.id);
        if (!current) {
            continue;
        }
        const previous = await input.snapshotStore.load(callSite.id);
        if (!previous) {
            await input.snapshotStore.save(callSite.id, current, meta);
            baselines.push(callSite);
            continue;
        }
        const drift = buildDriftResult(callSite, previous, current);
        if (drift.works.length > 0) {
            drifts.push(drift);
        }
    }

    return {
        callSites,
        fills,
        shapes,
        baselines,
        drifts,
        exitCode: sandbox.exitCode,
        duration: sandbox.duration,
        trafficCaptured: sandbox.trafficCaptured.length,
    };
}

async function scanCallSites(repoPath: string): Promise<CallSite[]> {
    const extractor = new TypeScriptExtractor();
    const files = readdirSync(repoPath, { recursive: true })
        .filter(
            (file): file is string =>
                typeof file === "string" &&
                /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file),
        )
        .filter((file) => !file.includes("node_modules"));

    const allCallSites: CallSite[] = [];
    for (const file of files) {
        const filePath = join(repoPath, file);
        const content = readFileSync(filePath, "utf8");
        const result = await extractor.extractFromFile(
            filePath,
            content,
            detectLanguage(filePath),
        );
        allCallSites.push(...result.callSites);
    }
    return allCallSites;
}