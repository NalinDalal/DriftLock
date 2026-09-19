import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Shape } from "@driftlock/diff";
import type { Store } from "@driftlock/db";

export interface CapturedShapes {
    request: Shape;
    response: Shape;
}

export interface SnapshotMeta {
    testCommand: string;
    exitCode: number;
    duration: number;
    trafficCaptured: number;
}

export interface SnapshotStore {
    load(callSiteId: string): Promise<CapturedShapes | null>;
    save(
        callSiteId: string,
        shapes: CapturedShapes,
        meta: SnapshotMeta,
    ): Promise<void>;
}

export class FileSnapshotStore implements SnapshotStore {
    private readonly directory: string;

    constructor(repoPath: string) {
        this.directory = join(repoPath, ".driftlock", "snapshots");
    }

    async load(callSiteId: string): Promise<CapturedShapes | null> {
        const file = join(this.directory, `${callSiteId}.json`);
        if (!existsSync(file)) {
            return null;
        }
        try {
            return JSON.parse(readFileSync(file, "utf8")) as CapturedShapes;
        } catch {
            return null;
        }
    }

    async save(callSiteId: string, shapes: CapturedShapes): Promise<void> {
        if (!existsSync(this.directory)) {
            mkdirSync(this.directory, { recursive: true });
        }
        writeFileSync(
            join(this.directory, `${callSiteId}.json`),
            JSON.stringify(shapes, null, 2),
        );
    }
}

export class DbSnapshotStore implements SnapshotStore {
    constructor(private readonly store: Store) {}

    async load(callSiteId: string): Promise<CapturedShapes | null> {
        const snap = await this.store.getLatestSnapshot(callSiteId);
        if (!snap) {
            return null;
        }
        return {
            request: snap.requestShape as CapturedShapes["request"],
            response: snap.responseShape as CapturedShapes["response"],
        };
    }

    async save(
        callSiteId: string,
        shapes: CapturedShapes,
        meta: SnapshotMeta,
    ): Promise<void> {
        await this.store.saveSnapshot({
            callSiteId,
            testCommand: meta.testCommand,
            exitCode: meta.exitCode,
            duration: meta.duration,
            trafficCaptured: meta.trafficCaptured,
            requestShape: shapes.request,
            responseShape: shapes.response,
        });
    }
}