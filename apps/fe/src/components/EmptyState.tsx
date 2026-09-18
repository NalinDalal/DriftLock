export function EmptyState({
    title,
    hint,
}: {
    title: string;
    hint?: string;
}) {
    return (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-neutral-700">{title}</p>
            {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
    );
}