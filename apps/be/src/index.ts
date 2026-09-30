import { config } from "./config";
import { authenticate } from "./auth";
import { badRequest, corsHeaders, corsResponse, isCorsPreflight, notFound } from "./utils";
import { handleHealth } from "./routes/health";
import { handleAccounts, handleAccountRepos, handleMe } from "./routes/accounts";
import {
    handleRepo,
    handleRepoCallSites,
    handleRepoPolicy,
    handleRepoPulls,
} from "./routes/repos";
import { handleRepoDrifts } from "./routes/drift";
import {
    handleGetSettings,
    handleRotateApiKey,
    handleUpdateSettings,
} from "./routes/settings";
import { handleRun } from "./routes/run";
import { handleReportRun } from "./routes/report";
import { handleActionsTemplate } from "./routes/templates";
import {
    handleWebhookEndpoints,
    handleWebhookSchemas,
    handleWebhookDrifts,
} from "./routes/webhooks";
import {
    handleGitHubLogin,
    handleGitHubCallback,
    handleGetSession,
    handleGitHubRepos,
    handleInstallUrl,
    handleLogout,
} from "./routes/auth";
import { handleGitHubSetup } from "./routes/githubSetup";
import { handleInstallationsSync } from "./routes/installations";

// Auth routes don't require credentials. /api/health stays public so
// orchestrators and load balancers can probe without a token.
const AUTH_ROUTES = new Set([
    "/api/health",
    "/api/templates/actions",
    "/api/auth/github",
    "/api/auth/github/callback",
    // GitHub redirects the browser here after an App install, so there is no
    // bearer token to present.
    "/api/github/setup",
    "/api/github/setup/callback",
]);

async function dispatch(req: Request, url: URL): Promise<Response> {
    if (url.pathname === "/api/health") {
        return handleHealth();
    }
    if (url.pathname === "/api/auth/github" && req.method === "GET") {
        return handleGitHubLogin(req);
    }
    if (url.pathname === "/api/auth/github/callback" && req.method === "GET") {
        return handleGitHubCallback(req);
    }
    if (url.pathname === "/api/auth/session") {
        return handleGetSession(req);
    }
    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        return handleLogout(req);
    }
    if (url.pathname === "/api/auth/repos") {
        return handleGitHubRepos(req);
    }
    if (url.pathname === "/api/auth/install") {
        return handleInstallUrl(req);
    }
    if (url.pathname === "/api/github/setup") {
        return handleGitHubSetup(req);
    }
    if (url.pathname === "/api/github/setup/callback") {
        return handleGitHubSetup(req);
    }
    if (url.pathname === "/api/installations/sync" && req.method === "POST") {
        return handleInstallationsSync(req);
    }
    if (url.pathname === "/api/me") {
        return handleMe(req);
    }
    if (url.pathname === "/api/accounts") {
        return handleAccounts();
    }
    const accountRepos = url.pathname.match(/^\/api\/accounts\/[^/]+\/repos$/);
    if (accountRepos) {
        return handleAccountRepos(url);
    }
    if (url.pathname === "/api/settings" && req.method === "GET") {
        return handleGetSettings();
    }
    if (url.pathname === "/api/settings" && req.method === "PUT") {
        return handleUpdateSettings(req);
    }
    if (url.pathname === "/api/settings/rotate") {
        return handleRotateApiKey(url);
    }
    if (url.pathname === "/api/runs" && req.method === "POST") {
        return handleRun(req);
    }
    if (url.pathname === "/api/runs/report" && req.method === "POST") {
        return handleReportRun(req);
    }
    if (url.pathname === "/api/templates/actions" && req.method === "GET") {
        return handleActionsTemplate();
    }
    if (url.pathname === "/api/webhooks/endpoints") {
        return handleWebhookEndpoints(url);
    }
    if (url.pathname.match(/^\/api\/webhooks\/endpoints\/[^/]+\/schemas$/)) {
        return handleWebhookSchemas(url);
    }
    if (url.pathname === "/api/webhooks/drifts") {
        return handleWebhookDrifts(url);
    }
    const repoPaths = /^\/api\/repos\/[^/]+\/[^/]+$/;
    if (repoPaths.test(url.pathname)) {
        return handleRepo(url);
    }
    if (url.pathname.endsWith("/callsites")) {
        return handleRepoCallSites(url);
    }
    if (url.pathname.endsWith("/drifts")) {
        return handleRepoDrifts(url);
    }
    if (url.pathname.endsWith("/pulls")) {
        return handleRepoPulls(url);
    }
    if (url.pathname.endsWith("/policy") && req.method === "PUT") {
        return handleRepoPolicy(url, req);
    }
    return notFound();
}

/** Stamp credentialed CORS headers on every response (handlers stay CORS-free). */
function withCors(res: Response, req: Request): Response {
    const headers = corsHeaders(req);
    for (const [key, value] of Object.entries(headers)) {
        res.headers.set(key, value);
    }
    return res;
}

const server = Bun.serve({
    port: config.port,
    async fetch(req) {
        if (isCorsPreflight(req)) {
            return corsResponse(req);
        }
        const url = new URL(req.url);

        // Skip auth for public routes; everything else accepts the
        // operator token, a per-key dlk_... credential, or the session cookie.
        if (!AUTH_ROUTES.has(url.pathname)) {
            const auth = await authenticate(req);
            if (auth instanceof Response) {
                return withCors(auth, req);
            }
        }

        try {
            return withCors(await dispatch(req, url), req);
        } catch (error) {
            console.error(error);
            return withCors(badRequest("Internal error"), req);
        }
    },
});

console.log(`DriftLock webhook API on http://localhost:${server.port}`);
export { server };