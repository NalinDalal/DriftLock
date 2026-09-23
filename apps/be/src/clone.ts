import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import simpleGit from "simple-git";

export interface CloneResult {
    path: string;
    cleanup: () => Promise<void>;
}

export async function cloneRepo(
    owner: string,
    name: string,
    branch?: string,
): Promise<CloneResult> {
    const token = process.env.GITHUB_TOKEN;
    const auth = token
        ? `x-access-token:${encodeURIComponent(token)}@`
        : "";
    const url = `https://${auth}github.com/${owner}/${name}.git`;
    const dir = await mkdtemp(join(tmpdir(), "driftlock-run-"));
    try {
        const git = simpleGit();
        await git.clone(url, dir, branch ? ["--branch", branch] : []);
    } catch (error) {
        await rm(dir, { recursive: true, force: true });
        throw error;
    }
    return {
        path: dir,
        cleanup: () => rm(dir, { recursive: true, force: true }),
    };
}