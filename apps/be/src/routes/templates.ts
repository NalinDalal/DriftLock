import { readFileSync } from "fs";
import { dirname, join } from "path";
import { json } from "../utils";

const TEMPLATE_PATH = join(
    dirname(import.meta.dir),
    "..",
    "..",
    "..",
    "templates",
    "driftlock.yml",
);

/**
 * Serve the GitHub Actions workflow template. Public: onboarding fetches it
 * before the user has any credential, then fills in __OWNER__ / __REPO__ /
 * __BRANCH__ / __API_URL__ client-side.
 */
export async function handleActionsTemplate(): Promise<Response> {
    let yaml: string;
    try {
        yaml = readFileSync(TEMPLATE_PATH, "utf8");
    } catch {
        return json({ error: "Workflow template unavailable" }, 500);
    }
    return json({ yaml });
}
