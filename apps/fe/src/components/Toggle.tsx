export function Toggle({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ${
                checked ? "bg-neutral-900" : "bg-neutral-300"
            }`}
        >
            <span
                aria-hidden
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150 ${
                    checked ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
            />
        </button>
    );
}