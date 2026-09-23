import type { ReactNode } from "react";

export function Card({
    children,
    className = "",
    onClick,
}: {
    children: ReactNode;
    className?: string;
    onClick?: () => void;
}) {
    return (
        <div
            onClick={onClick}
            className={`rounded-lg border border-neutral-200 bg-white ${className}`}
        >
            {children}
        </div>
    );
}