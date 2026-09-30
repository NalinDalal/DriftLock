import type { ReactNode } from "react";

// Presentational only. An earlier version took onClick on the div, which is
// both unused and a keyboard trap; callers wrap a Card in a Link instead, so
// the anchor stays the single focusable, activatable element.
export function Card({
    children,
    className = "",
    style,
}: {
    children: ReactNode;
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <div
            style={style}
            className={`rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(10,10,15,0.04)] ${className}`}
        >
            {children}
        </div>
    );
}
