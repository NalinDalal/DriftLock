import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import AppShell from "./routes/__root";
import AccountsPage from "./routes/index";
import AccountPage from "./routes/account";
import RepoPage from "./routes/repo";
import SettingsPage from "./routes/settings";

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

const routeTree = rootRoute.addChildren([
    indexRoute,
    accountRoute,
    repoRoute,
    settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}