import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { getMe } from "../api/client";
import { onToast } from "../lib/toast";

function LockMark() {
    return (
        <span className="relative flex h-[28px] w-[28px] items-center justify-center rounded-[6px] bg-[var(--color-ink)] text-[var(--color-paper)]">
            <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden
            >
                <rect
                    x="3"
                    y="6"
                    width="8"
                    height="6"
                    rx="1"
                    stroke="white"
                    strokeWidth="1.2"
                />
                <path
                    d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6"
                    stroke="white"
                    strokeWidth="1.2"
                />
                <circle cx="7" cy="9" r="1" fill="white" />
            </svg>
            <span className="absolute -top-[3px] -right-[3px] h-[7px] w-[7px] rounded-full bg-[var(--color-signal-red)] ring-2 ring-[var(--color-paper)]" />
        </span>
    );
}

export default function AppShell() {
    const location = useLocation();
    const [user, setUser] = useState<{ name: string; handle: string } | null>(
        null,
    );
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    useEffect(() => {
        // Header auth state is global: the landing page must also show the
        // signed-in user instead of "Sign in". /api/me is cookie-authenticated
        // and resolves to { user: null } when logged out or offline, so this
        // is safe on public routes (failures just mean "signed out").
        getMe()
            .then(({ user: me }) => setUser(me ?? null))
            .catch(() => setUser(null));
    }, [location.pathname]);

    useEffect(() => {
        onToast((message) => {
            setToastMsg(message);
            window.setTimeout(() => setToastMsg(null), 2800);
        });
        return () => onToast(() => undefined);
    }, []);

    // The landing page at "/" is not the accounts dashboard, so it must not
    // highlight the Accounts nav item.
    const onAccounts =
        location.pathname.startsWith("/accounts") ||
        location.pathname.startsWith("/repos");
    const onWebhooks = location.pathname.startsWith("/webhooks");
    const onSettings = location.pathname.startsWith("/settings");
    const onInstall = location.pathname.startsWith("/install");
    const onLogin = location.pathname.startsWith("/login");

    const navLink = (active: boolean) =>
        `relative flex min-h-[44px] items-center px-3 text-[13px] font-medium tracking-[-0.01em] transition-colors ${active ? "text-[var(--color-ink)]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`;

    async function handleLogout() {
        // Revoke server-side (cookie cleared by the response); the redirect
        // happens either way so a dead backend cannot trap the user.
        try {
            await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } catch {
            // Best-effort: still leave.
        }
        window.location.href = "/";
    }

    const [dark, setDark] = useState(() => {
        if (typeof window === "undefined") return false;
        return localStorage.getItem("driftlock_theme") === "dark" || (!localStorage.getItem("driftlock_theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    });
    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        localStorage.setItem("driftlock_theme", dark ? "dark" : "light");
    }, [dark]);

    return (
        <div className="flex min-h-screen flex-col bg-[var(--color-paper)] transition-colors">
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[8px] focus:bg-[var(--color-ink)] focus:px-4 focus:py-2.5 focus:text-[13px] focus:font-medium focus:text-[var(--color-paper)]"
            >
                Skip to content
            </a>
            <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--color-paper)]/85 backdrop-blur-[10px]">
                <div className="mx-auto flex h-[60px] w-full max-w-[1080px] items-center justify-between gap-4 px-6">
                    <div className="flex items-center gap-6">
                        <Link to="/" className="flex items-center gap-2.5">
                            <LockMark />
                            <span className="text-[16px] font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
                                DriftLock
                            </span>
                            <span className="hidden items-center gap-1 rounded-[6px] border border-[var(--color-line-strong)]/10 bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-wide text-[var(--color-ink)] sm:inline-flex">
                                REV. 01
                            </span>
                        </Link>
                        <nav aria-label="Primary" className="hidden items-center gap-0 sm:flex">
                            <Link
                                to="/accounts"
                                className={navLink(onAccounts)}
                            >
                                Repos
                                {onAccounts && (
                                    <span className="absolute inset-x-3 -bottom-[8px] h-[2px] bg-[var(--color-ink)]" />
                                )}
                            </Link>
                            <Link
                                to="/webhooks"
                                className={navLink(onWebhooks)}
                            >
                                Webhooks
                                {onWebhooks && (
                                    <span className="absolute inset-x-3 -bottom-[8px] h-[2px] bg-[var(--color-ink)]" />
                                )}
                            </Link>
                            <Link
                                to="/settings"
                                className={navLink(onSettings)}
                            >
                                Settings
                                {onSettings && (
                                    <span className="absolute inset-x-3 -bottom-[8px] h-[2px] bg-[var(--color-ink)]" />
                                )}
                            </Link>
                        </nav>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setDark(!dark)}
                            aria-label="Toggle theme"
                            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)] transition-colors hover:bg-[var(--color-line)]"
                            title={dark ? "Switch to light" : "Switch to dark"}
                        >
                            <span className="text-[11px]">{dark ? "☀" : "☾"}</span>
                        </button>
                        <nav aria-label="Primary, compact" className="flex items-center gap-0 sm:hidden">
                            <Link
                                to="/accounts"
                                className={navLink(onAccounts)}
                            >
                                Repos
                            </Link>
                            <Link
                                to="/webhooks"
                                className={navLink(onWebhooks)}
                            >
                                Hooks
                            </Link>
                        </nav>
                        <Link
                            to="/install"
                            className={`hidden min-h-[44px] items-center justify-center rounded-full px-4 text-[13px] font-medium transition-[transform,background] active:scale-[0.97] sm:inline-flex ${onInstall ? "bg-[var(--color-ink)] text-[var(--color-paper)]" : "bg-[var(--color-ink)] text-[var(--color-paper)] hover:opacity-90"}`}
                        >
                            Install
                        </Link>
                        <Link
                            to="/install"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--color-ink)] px-3 text-xs font-medium text-[var(--color-paper)] active:scale-[0.97] sm:hidden"
                        >
                            Install
                        </Link>
                        {user ? (
                            <div className="hidden items-center gap-2 sm:flex">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-ink)] text-[11px] font-semibold text-[var(--color-paper)]">
                                    {user.name
                                        .split(" ")
                                        .map((p) => p[0])
                                        .slice(0, 2)
                                        .join("")}
                                </span>
                                <button
                                    onClick={handleLogout}
                                    className="min-h-[44px] px-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:underline"
                                >
                                    Sign out
                                </button>
                            </div>
                        ) : (
                            <Link
                                to="/login"
                                className={`inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${onLogin ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]" : "border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink)] hover:bg-[var(--color-line)]"}`}
                            >
                                Sign in
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1080px] flex-1 px-6 py-8">
                <Outlet />
            </main>

            <footer className="border-t border-[var(--color-line)] bg-[var(--color-paper)]">
                <div className="mx-auto w-full max-w-[1080px] px-6 py-8">
                    <div className="grid gap-8 sm:grid-cols-[1.2fr_1fr_1fr]">
                        <div>
                            <p className="text-xs leading-4 text-[var(--color-muted)]">
                                DriftLock is a revision bureau. Every drift is a
                                redline, every fix is a PR. Nothing is merged
                                without you.
                            </p>
                            <p className="mt-3 font-mono text-[11px] tracking-wide text-[var(--color-muted)]">
                                DEPENDABOT BUT FOR APIS · REV. 01
                            </p>
                        </div>
                        <nav aria-label="Product" className="flex flex-col gap-1">
                            <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-muted)]">PRODUCT</p>
                            <Link
                                to="/install"
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                Install GitHub App
                            </Link>
                            <Link
                                to="/webhooks"
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                Webhook Drift Detection
                            </Link>
                            <Link
                                to="/actions"
                                search={{ repo: undefined }}
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                Run a Fix
                            </Link>
                            <Link
                                to="/accounts"
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                Browse Repositories
                            </Link>
                            <Link
                                to="/statistics"
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                API Drift Statistics 2026
                            </Link>
                            <Link
                                to="/security"
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                Security and Privacy
                            </Link>
                        </nav>
                        <nav aria-label="Company" className="flex flex-col gap-1">
                            <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-muted)]">COMPANY</p>
                            <Link
                                to="/about"
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                About DriftLock
                            </Link>
                            <Link
                                to="/onboarding"
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                Onboarding Guide
                            </Link>
                            <Link
                                to="/privacy"
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                Privacy Policy
                            </Link>
                            <Link
                                to="/terms"
                                className="flex min-h-[32px] items-center font-mono text-[12px] tracking-wide text-[var(--color-ink)] hover:underline underline-offset-2"
                            >
                                Terms of Service
                            </Link>
                        </nav>
                    </div>
                </div>
            </footer>

            {/* The live region is always mounted. A region that appears at the
                same moment as its text is often not announced, and this toast
                is the only confirmation a save produces. */}
            <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-6"
            >
                {toastMsg && (
                    <div className="pointer-events-auto rounded-full bg-[var(--color-ink)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-paper)] shadow-lg">
                        {toastMsg}
                    </div>
                )}
            </div>
        </div>
    );
}
