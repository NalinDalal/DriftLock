export type DotTone = "neutral" | "green" | "amber" | "red" | "blue";

// Dot fills reuse the existing semantic text tokens, so a status colour is
// identical to the matching Badge tone and no new token is spent. All four are
// mid-tone values that hold up on the light and dark surface.
const DOTS: Record<DotTone, string> = {
    neutral: "bg-[var(--color-muted-2)]",
    green: "bg-[var(--color-success-text)]",
    amber: "bg-[var(--color-warning-text)]",
    red: "bg-[var(--color-danger-text)]",
    blue: "bg-[var(--color-info-text)]",
};

export function StatusDot({
    tone,
    pulsing = false,
}: {
    tone: DotTone;
    pulsing?: boolean;
}) {
    return (
        <span className="relative inline-flex h-2 w-2 shrink-0">
            {pulsing && (
                <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${DOTS[tone]}`}
                />
            )}
            <span
                className={`relative inline-flex h-2 w-2 rounded-full ${DOTS[tone]}`}
            />
        </span>
    );
}
