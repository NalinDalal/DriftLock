import { Link } from "@tanstack/react-router";
import { NotFoundPage } from "./__root";

export default function NotFoundRoute() {
    return (
        <div>
            <NotFoundPage />
            <p className="mx-auto mt-2 max-w-[520px] text-center font-mono text-xs text-[var(--color-muted)]">
                Lost in docs? Start at{" "}
                <Link to="/docs" className="underline underline-offset-2 hover:text-[var(--color-ink)]">
                    /docs
                </Link>
                .
            </p>
        </div>
    );
}
