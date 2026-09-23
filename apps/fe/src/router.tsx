import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import AppShell from "./routes/__root";
import AccountsPage from "./routes/index";
import AccountPage from "./routes/account";
import RepoPage from "./routes/repo";
import SettingsPage from "./routes/settings";
import WebhookDashboard from "./routes/webhooks";
import LoginPage from "./routes/login";
import AuthCallbackPage from "./routes/auth-callback";
import InstallPage from "./routes/install";

const rootRoute = createRootRoute({ component: AppShell });

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <AccountsPage />,
});

const accountRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/accounts/$owner",
    component: () => {
        const { owner } = accountRoute.useParams();
        return <AccountPage owner={owner} />;
    },
});

const repoRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/repos/$owner/$name",
    component: () => {
        const { owner, name } = repoRoute.useParams();
        return <RepoPage owner={owner} name={name} />;
    },
});

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: SettingsPage,
});

const webhooksRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/webhooks",
    component: WebhookDashboard,
});

const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: LoginPage,
});

const authCallbackRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/auth/callback",
    component: AuthCallbackPage,
});

const installRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/install",
    component: InstallPage,
});

const routeTree = rootRoute.addChildren([
    indexRoute,
    accountRoute,
    repoRoute,
    settingsRoute,
    webhooksRoute,
    loginRoute,
    authCallbackRoute,
    installRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}