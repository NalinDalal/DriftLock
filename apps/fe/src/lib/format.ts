export function timeAgo(iso: string | null): string {
    if (!iso) {
        return "never";
    }
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) {
        return "just now";
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
        return `${days}d ago`;
    }
    return new Date(iso).toLocaleDateString();
}

export function relativeTime(iso: string): string {
    return timeAgo(iso);
}

export function titleCase(value: string): string {
    return value
        .split("-")
        .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
        .join("-");
}

export const PERMISSION_LABELS: Record<string, string> = {
    read: "Read",
    "read-write": "Read + write",
    "suggest-only": "Suggest only",
};