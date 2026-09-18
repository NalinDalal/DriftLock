import { useEffect, useState } from "react";

export function useFetch<T>(fn: () => Promise<T>, deps: unknown[]): {
    data: T | null;
    error: string | null;
    loading: boolean;
    reload: () => void;
} {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        fn()
            .then((value) => {
                if (alive) {
                    setData(value);
                    setLoading(false);
                }
            })
            .catch((err: unknown) => {
                if (alive) {
                    setError(err instanceof Error ? err.message : "Failed to load");
                    setLoading(false);
                }
            });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick]);

    return { data, error, loading, reload: () => setTick((t) => t + 1) };
}