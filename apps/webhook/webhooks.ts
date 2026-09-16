import { createHmac, timingSafeEqual } from "crypto";
import { getDb, installations, repositories } from "@driftlock/db";
import { eq } from "drizzle-orm";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn("No GITHUB_WEBHOOK_SECRET set — skipping signature verification");
    return true;
  }

  const expected = "sha256=" +
    createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function webhookHandler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const signature = req.headers.get("x-hub-signature-256") || "";
  const eventType = req.headers.get("x-github-event") || "";
  const deliveryId = req.headers.get("x-github-delivery") || "";

  const body = await req.text();

  if (!verifySignature(body, signature)) {
    console.error(`Invalid signature for delivery ${deliveryId}`);
    return json({ error: "Invalid signature" }, 401);
  }

  console.log(`Received ${eventType} event (delivery: ${deliveryId})`);

  try {
    const payload = JSON.parse(body);

    switch (eventType) {
      case "installation":
        await handleInstallation(payload);
        break;
      case "installation_repositories":
        await handleInstallationRepositories(payload);
        break;
      case "push":
        await handlePush(payload);
        break;
      case "pull_request":
        await handlePullRequest(payload);
        break;
      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    return json({ received: true });
  } catch (error) {
    console.error(`Error processing ${eventType} event:`, error);
    return json({ error: "Internal server error" }, 500);
  }
}

async function handleInstallation(payload: any) {
  const { action, installation, repositories: repos } = payload;
  const db = getDb();

  console.log(`Installation ${action}: ${installation.account.login}`);

  switch (action) {
    case "created":
      // Save installation
      await db.insert(installations).values({
        installationId: installation.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        appId: installation.app_id,
        targetSelection: installation.target_selection,
        permissions: installation.permissions,
        events: installation.events,
      });

      // Save repositories
      if (repos?.length) {
        await db.insert(repositories).values(
          repos.map((repo: any) => ({
            owner: repo.owner.login,
            name: repo.name,
            fullName: repo.full_name,
            installationId: installation.id,
            defaultBranch: repo.default_branch || "main",
          }))
        );
      }

      console.log(`  Saved installation with ${repos?.length || 0} repositories`);
      break;

    case "deleted":
      // Remove installation and cascade delete repositories
      await db
        .delete(installations)
        .where(eq(installations.installationId, installation.id));
      console.log(`  Installation deleted`);
      break;
  }
}

async function handleInstallationRepositories(payload: any) {
  const { action, installation, repositories_added, repositories_removed } = payload;
  const db = getDb();

  console.log(`Installation repositories ${action}: ${installation.account.login}`);

  switch (action) {
    case "added":
      if (repositories_added?.length) {
        await db.insert(repositories).values(
          repositories_added.map((repo: any) => ({
            owner: repo.owner.login,
            name: repo.name,
            fullName: repo.full_name,
            installationId: installation.id,
            defaultBranch: repo.default_branch || "main",
          }))
        );
        console.log(`  Added: ${repositories_added.map((r: any) => r.full_name).join(", ")}`);
      }
      break;

    case "removed":
      if (repositories_removed?.length) {
        for (const repo of repositories_removed) {
          await db
            .delete(repositories)
            .where(eq(repositories.fullName, repo.full_name));
        }
        console.log(`  Removed: ${repositories_removed.map((r: any) => r.full_name).join(", ")}`);
      }
      break;
  }
}

async function handlePush(payload: any) {
  const { repository, ref, commits } = payload;

  console.log(`Push to ${repository.full_name}: ${ref}`);
  console.log(`  ${commits?.length || 0} commits`);

  // TODO: Check if any commits affect API call sites
  // TODO: Run drift detection if relevant files changed
}

async function handlePullRequest(payload: any) {
  const { action, pull_request, repository } = payload;

  console.log(`PR ${action}: ${pull_request.title} in ${repository.full_name}`);

  // TODO: If PR is merged, check for API changes
  // TODO: If PR is opened by DriftLock, track status
}
