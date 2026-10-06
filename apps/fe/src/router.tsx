import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import AppShell, { NotFoundPage } from "./routes/__root";
import LandingPage from "./routes/index";

// The landing page is the first paint, so it stays eager. Everything else is
// behind a dynamic import: the settings form, install flow, and about page were
// all shipping to a visitor who had only asked for the homepage.
const AccountsPage = lazyRouteComponent(() => import("./routes/accounts"), "default");
const AccountPage = lazyRouteComponent(() => import("./routes/account"), "default");
const RepoPage = lazyRouteComponent(() => import("./routes/repo"), "default");
const SettingsPage = lazyRouteComponent(() => import("./routes/settings"), "default");
const WebhookDashboard = lazyRouteComponent(() => import("./routes/webhooks"), "default");
const LoginPage = lazyRouteComponent(() => import("./routes/login"), "default");
const AuthCallbackPage = lazyRouteComponent(() => import("./routes/auth-callback"), "default");
const InstallPage = lazyRouteComponent(() => import("./routes/install"), "default");
const InstallSuccessPage = lazyRouteComponent(() => import("./routes/install-success"), "default");
const AboutPage = lazyRouteComponent(() => import("./routes/about"), "default");
const StatisticsPage = lazyRouteComponent(() => import("./routes/statistics"), "default");
const ChangelogPage = lazyRouteComponent(() => import("./routes/changelog"), "default");
const SecurityPage = lazyRouteComponent(() => import("./routes/security"), "default");
const PrivacyPage = lazyRouteComponent(() => import("./routes/privacy"), "default");
const TermsPage = lazyRouteComponent(() => import("./routes/terms"), "default");
const OnboardingPage = lazyRouteComponent(() => import("./routes/onboarding"), "default");
const ActionsPage = lazyRouteComponent(() => import("./routes/actions"), "default");
const FeaturesPage = lazyRouteComponent(() => import("./routes/features"), "default");
const DocsPage = lazyRouteComponent(() => import("./routes/docs"), "default");
const ContactPage = lazyRouteComponent(() => import("./routes/contact"), "default");
const NotFoundRoutePage = lazyRouteComponent(() => import("./routes/404"), "default");

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFoundPage });

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <LandingPage />,
});

const accountsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/accounts",
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

const installSuccessRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/install/success",
    component: InstallSuccessPage,
});

const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/about",
    component: AboutPage,
});

const statisticsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/statistics",
    component: StatisticsPage,
});

const changelogRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/changelog",
    component: ChangelogPage,
});

const securityRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/security",
    component: SecurityPage,
});

const privacyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/privacy",
    component: PrivacyPage,
});

const termsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/terms",
    component: TermsPage,
});

const onboardingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/onboarding",
    component: OnboardingPage,
});

const actionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/actions",
    // Optional preselect after /install: /actions?repo=owner/name jumps
    // straight to step 3 for that repo.
    validateSearch: (search: Record<string, unknown>) => ({
        repo: typeof search.repo === "string" ? search.repo : undefined,
    }),
    component: ActionsPage,
});

const featuresRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/features",
    component: FeaturesPage,
});

const docsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/docs",
    component: DocsPage,
});

const contactRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/contact",
    component: ContactPage,
});

const notFoundExplicitRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/404",
    component: NotFoundRoutePage,
});

const routeTree = rootRoute.addChildren([
    indexRoute,
    accountsRoute,
    accountRoute,
    repoRoute,
    settingsRoute,
    webhooksRoute,
    loginRoute,
    authCallbackRoute,
    installRoute,
    installSuccessRoute,
    aboutRoute,
    statisticsRoute,
    changelogRoute,
    securityRoute,
    privacyRoute,
    termsRoute,
    onboardingRoute,
    actionsRoute,
    featuresRoute,
    docsRoute,
    contactRoute,
    notFoundExplicitRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}