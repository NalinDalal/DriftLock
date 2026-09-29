import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "green" | "amber" | "red" | "blue";

const TONES: Record<BadgeTone, string> = {
    neutral: "bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-line)]",
    green: "bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-[var(--color-success-border)]",
    amber: "bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] border-[var(--color-warning-border)]",
    red: "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] border-[var(--color-danger-border)]",
    blue: "bg-[var(--color-info-bg)] text-[var(--color-info-text)] border-[var(--color-info-border)]",
};

export function Badge({
    tone = "neutral",
    children,
}: {
    tone?: BadgeTone;
    children: ReactNode;
}) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 tracking-wide ${TONES[tone]}`}
        >
            {children}
        </span>
    );
}
