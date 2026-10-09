import { useEffect } from "react";
import { Link } from "@tanstack/react-router";

export default function ContactPage() {
    useEffect(() => {
        document.title = "Contact | DriftLock";
    }, []);

    return (
        <div className="mx-auto max-w-[880px]">
            <nav className="mb-6 font-mono text-xs tracking-wide text-[var(--color-muted)]">
                <Link to="/" className="hover:text-[var(--color-ink)] hover:underline underline-offset-2">
                    Home
                </Link>{" "}
                <span className="text-[var(--color-muted-2)]">/</span> Contact
            </nav>

            <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-muted)]">WE REPLY BY EMAIL</p>
            <h1 className="display mt-2 text-[var(--color-ink)]">Contact</h1>
            <p className="mt-4 max-w-[65ch] font-mono text-[14px] leading-6 text-[var(--color-ink)]/80">
                One inbox for help, one path for security bugs. No forms, no sales call.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Help</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Install issues, drift questions, fix PR feedback:
            </p>
            <p className="mt-2 font-mono text-sm text-[var(--color-ink)]">
                <a href="mailto:nalin@nerdev.in" className="underline underline-offset-2 hover:text-[var(--color-ink)]">nalin@nerdev.in</a>
            </p>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-muted)]">
                Also on <a href="https://discord.gg/driftlock" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--color-ink)]">Discord</a> and{" "}
                <a href="https://github.com/nerdev-co/DriftLock/issues" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--color-ink)]">GitHub issues</a>.
            </p>

            <h2 className="mt-12 border-t border-[var(--color-line-strong)] pt-6 heading-section text-[var(--color-ink)]">Security bugs</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-5 text-[var(--color-ink)]/80">
                Do not open a public issue for vulnerabilities. Email directly:
            </p>
            <p className="mt-2 font-mono text-sm text-[var(--color-ink)]">
                <a href="mailto:nalin@nerdev.in?subject=Security%20report" className="underline underline-offset-2 hover:text-[var(--color-ink)]">nalin@nerdev.in</a>
            </p>

            <div className="mt-10 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-6">
                <Link to="/docs" className="border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-paper)] hover:bg-[var(--color-ink)]/90">Docs</Link>
                <Link to="/security" className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 font-mono text-xs tracking-wide text-[var(--color-ink)] hover:bg-[var(--color-paper)]">Security</Link>
            </div>
        </div>
    );
}
