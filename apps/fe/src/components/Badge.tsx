import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "green" | "amber" | "red" | "blue";

const TONES: Record<BadgeTone, string> = {
    neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
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
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 ${TONES[tone]}`}
        >
            {children}
        </span>
    );
}