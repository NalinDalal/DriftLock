export function Stat({
    label,
    value,
    hint,
    className = "",
}: {
    label: string;
    value: string | number;
    hint?: string;
    className?: string;
}) {
    return (
        <div className={`flex flex-col gap-0.5 ${className}`}>
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                {label}
            </span>
            <span className="text-2xl font-semibold tabular-nums text-neutral-900">
                {value}
            </span>
            {hint && (
                <span className="text-xs text-neutral-500">{hint}</span>
            )}
        </div>
    );
}