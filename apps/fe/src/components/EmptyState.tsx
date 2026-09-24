export function EmptyState({
    title,
    hint,
}: {
    title: string;
    hint?: string;
}) {
    return (
        <div className="flex flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-zinc-200 bg-zinc-50/60 px-6 py-10 text-center">
            <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white border border-zinc-200 text-zinc-400">
                <span className="text-sm">◯</span>
            </div>
            <p className="text-[13px] font-medium text-zinc-700">{title}</p>
            {hint && <p className="max-w-sm text-xs leading-4 text-zinc-500">{hint}</p>}
        </div>
    );
}
