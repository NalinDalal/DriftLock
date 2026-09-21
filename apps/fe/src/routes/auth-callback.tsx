import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

export default function AuthCallbackPage() {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");

        if (token) {
            // Store token in localStorage
            localStorage.setItem("driftlock_token", token);
            // Redirect to home
            navigate({ to: "/" });
        } else {
            setError("No token received");
        }
    }, [navigate]);

    if (error) {
        return (
            <div className="flex min-h-[80vh] items-center justify-center">
                <div className="text-center">
                    <h2 className="text-lg font-semibold text-red-600">Authentication failed</h2>
                    <p className="mt-2 text-sm text-neutral-500">{error}</p>
                    <button
                        onClick={() => navigate({ to: "/login" })}
                        className="mt-4 text-sm text-blue-600 hover:underline"
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
                <div className="animate-spin h-8 w-8 border-4 border-neutral-300 border-t-neutral-900 rounded-full mx-auto" />
                <p className="mt-4 text-sm text-neutral-500">Signing you in...</p>
            </div>
        </div>
    );
}
