export type DotTone = "neutral" | "green" | "amber" | "red" | "blue";

const DOTS: Record<DotTone, string> = {
    neutral: "bg-neutral-300",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
};

export function StatusDot({
    tone,
    pulsing = false,
}: {
    tone: DotTone;
    pulsing?: boolean;
}) {
    return (
        <span className="relative inline-flex h-2 w-2">
            {pulsing && (
                <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${DOTS[tone]}`}
                />
            )}
            <span
                className={`relative inline-flex h-2 w-2 rounded-full ${DOTS[tone]}`}
            />
        </span>
    );
}