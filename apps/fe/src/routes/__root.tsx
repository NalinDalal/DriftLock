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
        getMe()
            .then(({ user: me }) => setUser(me))
            .catch(() => setUser(null));
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
                                to="/settings"
                                className={`rounded-md px-3 py-1.5 transition-colors duration-150 ${
                                    onSettings
                                        ? "bg-neutral-100 text-neutral-900"
                                        : "text-neutral-500 hover:text-neutral-900"
                                }`}
                            >
                                Settings
                            </Link>
                        </nav>
                    </div>
                    {user && (
                        <div className="flex items-center gap-2">
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
                        </div>
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