import { Button } from "../components/Button";

const API_URL = import.meta.env.VITE_API_URL ?? "";

function GitHubIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
    );
}

export default function LoginPage() {
    function handleLogin() {
        window.location.href = `${API_URL}/api/auth/github`;
    }

    return (
        <div className="flex min-h-[80vh] items-center justify-center">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-neutral-900">DriftLock</h1>
                    <p className="mt-2 text-sm text-neutral-500">
                        Self-maintaining APIs. Never break a webhook again.
                    </p>
                </div>

                <div className="bg-white rounded-lg border border-neutral-200 p-8 shadow-sm">
                    <div className="text-center mb-6">
                        <h2 className="text-lg font-semibold text-neutral-900">Sign in with GitHub</h2>
                        <p className="mt-2 text-sm text-neutral-500">
                            Connect your GitHub account to install DriftLock on your repos.
                        </p>
                    </div>

                    <Button
                        onClick={handleLogin}
                        className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white hover:bg-neutral-800"
                    >
                        <GitHubIcon />
                        Continue with GitHub
                    </Button>

                    <p className="mt-4 text-xs text-center text-neutral-400">
                        We'll ask for permission to read your repos and create PRs.
                    </p>
                </div>

                <div className="mt-6 text-center">
                    <p className="text-xs text-neutral-400">
                        By signing in, you agree to our Terms of Service.
                    </p>
                </div>
            </div>
        </div>
    );
}
