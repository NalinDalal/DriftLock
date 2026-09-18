let listener: ((message: string) => void) | null = null;

export function toast(message: string): void {
    listener?.(message);
}

export function onToast(fn: (message: string) => void): void {
    listener = fn;
}