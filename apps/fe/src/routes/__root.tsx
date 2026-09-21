import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { getMe } from "../api/client";
import { onToast } from "../lib/toast";

export default function AppShell() {
    const location = useLocation();
    const [user, setUser] = useState<{ name: string; handle: string } | null>(
        null,
    );
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    useEffect(() => {
        // Check for GitHub auth token
        const token = localStorage.getItem("driftlock_token");
        if (token) {
            fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/auth/session`, {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((res) => res.json())
                .then((data) => {
                    if (data.user) {
                        setUser({ name: data.user.name, handle: data.user.login });
                    }
                })
                .catch(() => {});
        } else {
            getMe()
                .then(({ user: me }) => setUser(me))
                .catch(() => setUser(null));
        }
    }, []);

    useEffect(() => {
        onToast((message) => {
            setToastMsg(message);
            window.setTimeout(() => setToastMsg(null), 2800);
        });
        return () => onToast(() => undefined);
    }, []);

    const onAccounts =
        location.pathname.startsWith("/accounts") ||
        location.pathname.startsWith("/repos");
    const onSettings = location.pathname.startsWith("/settings");
    const onWebhooks = location.pathname.startsWith("/webhooks");
    const onInstall = location.pathname.startsWith("/install");
    const onLogin = location.pathname.startsWith("/login");

    function handleLogout() {
        localStorage.removeItem("driftlock_token");
        window.location.href = "/";
    }

    return (
        <div className="flex min-h-screen flex-col">
            <header className="border-b border-neutral-200 bg-white">
                <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
                    <div className="flex items-center gap-8">
                        <Link
                            to="/"
                            className="text-[15px] font-semibold tracking-tight text-neutral-900"
                        >
                            DriftLock
                        </Link>
                        <nav className="flex items-center gap-1 text-sm">
                            <Link
                                to="/"
                                className={`rounded-md px-3 py-1.5 transition-colors duration-150 ${
                                    onAccounts
                                        ? "bg-neutral-100 text-neutral-900"
                                        : "text-neutral-500 hover:text-neutral-900"
                                }`}
                            >
                                Repos
                            </Link>
                            <Link
                                to="/install"
                                className={`rounded-md px-3 py-1.5 transition-colors duration-150 ${
                                    onInstall
                                        ? "bg-neutral-100 text-neutral-900"
                                        : "text-neutral-500 hover:text-neutral-900"
                                }`}
                            >
                                Install
                            </Link>
                            <Link
                                to="/settings"
                                className={`rounded-md px-3 py-1.5 transition-colors duration-150 ${
                                    onSettings
                                        ? "bg-neutral-100 text-neutral-900"
                                        : "text-neutral-500 hover:text-neutral-900"
                                }`}
                            >
                                Settings
                            </Link>
                            <Link
                                to="/webhooks"
                                className={`rounded-md px-3 py-1.5 transition-colors duration-150 ${
                                    onWebhooks
                                        ? "bg-neutral-100 text-neutral-900"
                                        : "text-neutral-500 hover:text-neutral-900"
                                }`}
                            >
                                Webhooks
                            </Link>
                        </nav>
                    </div>
                    {user ? (
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-neutral-500">
                                {user.name}
                            </span>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600">
                                {user.name
                                    .split(" ")
                                    .map((part) => part[0])
                                    .slice(0, 2)
                                    .join("")}
                            </span>
                            <button
                                onClick={handleLogout}
                                className="text-xs text-neutral-400 hover:text-neutral-600"
                            >
                                Sign out
                            </button>
                        </div>
                    ) : (
                        <Link
                            to="/login"
                            className={`rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
                                onLogin
                                    ? "bg-neutral-900 text-white"
                                    : "bg-neutral-900 text-white hover:bg-neutral-800"
                            }`}
                        >
                            Sign in
                        </Link>
                    )}
                </div>
            </header>

            <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
                <Outlet />
            </main>

            <footer className="border-t border-neutral-200 bg-white">
                <div className="mx-auto w-full max-w-5xl px-6 py-4 text-xs text-neutral-500">
                    DriftLock watches your API integrations and opens GitHub
                    PRs when a vendor contract drifts. Nothing is merged or
                    applied from this dashboard.
                </div>
            </footer>

            {toastMsg && (
                <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center px-6">
                    <div className="pointer-events-auto rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
                        {toastMsg}
                    </div>
                </div>
            )}
        </div>
    );
}