export function Toggle({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label?: string;
}) {
    // The track is 22px tall, so the button carries a 44px hit area and the
    // track sits centred inside it. Off state uses --color-line rather than a
    // fixed grey: it reads as "off" against ink in light and in dark, which a
    // hardcoded pair of hex values cannot do.
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className="flex h-11 w-[52px] shrink-0 items-center justify-center"
        >
            <span
                aria-hidden
                className={`relative inline-flex h-[22px] w-[38px] items-center rounded-full transition-colors duration-200 ${
                    checked
                        ? "bg-[var(--color-ink)]"
                        : "bg-[var(--color-line)] ring-1 ring-inset ring-[var(--color-line-strong)]/20"
                }`}
            >
                <span
                    className={`inline-block h-[18px] w-[18px] rounded-full shadow-sm transition-[transform,background-color] duration-200 ${
                        checked
                            ? "translate-x-[18px] bg-[var(--color-paper)]"
                            : "translate-x-[2px] bg-[var(--color-ink)]"
                    }`}
                />
            </span>
        </button>
    );
}
