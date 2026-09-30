import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export default function AuthCallbackPage() {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // The session now lives in an httpOnly cookie set by the backend
        // during the OAuth redirect chain, there is no token in the URL to
        // collect. Confirm the session, then go home.
        fetch(`${API_URL}/api/auth/session`, { credentials: "include" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data?.user) {
                    navigate({ to: "/" });
                } else {
                    setError("No session established");
                }
            })
            .catch(() => setError("Sign-in failed"));
    }, [navigate]);

    if (error) {
        return (
            <div className="flex min-h-[80vh] items-center justify-center">
                <div className="text-center">
                    <h2 className="text-lg font-semibold text-[var(--color-signal-red)]">Authentication failed</h2>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">{error}</p>
                    <button
                        onClick={() => navigate({ to: "/login" })}
                        className="mt-4 text-sm text-[var(--color-info-text)] hover:underline"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-[80vh] items-center justify-center">
            <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-[var(--color-line)] border-t-[var(--color-ink)] rounded-full mx-auto" />
                <p className="mt-4 text-sm text-[var(--color-muted)]">Signing you in...</p>
            </div>
        </div>
    );
}
