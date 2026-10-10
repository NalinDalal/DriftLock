import {
    AbsoluteFill,
    interpolate,
    spring,
    useCurrentFrame,
    useVideoConfig,
} from "remotion";
import { EMERALD, INK, MONO, PAPER, ZINC } from "./theme";

const ROWS = ["drift detected", "fix suggested", "PR opened"];

// Beat 3 — PROOF + END CARD (3s @30fps). Checks illuminate left to right,
// then lock mark + driftlock.dev fade up.
export const ProofEnd: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    return (
        <AbsoluteFill
            style={{
                backgroundColor: INK,
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "column",
                gap: 18,
            }}
        >
            {ROWS.map((row, i) => {
                const start = 8 + i * 14;
                const p = spring({ frame: frame - start, fps, config: { damping: 18 } });
                const on = frame >= start;
                return (
                    <div
                        key={row}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                            fontFamily: MONO,
                            fontSize: 40,
                            color: on ? PAPER : ZINC,
                            opacity: on ? 1 : 0.35,
                            transform: `translateX(${(1 - Math.min(1, Math.max(0, p))) * 24}px)`,
                        }}
                    >
                        <span
                            style={{
                                display: "inline-flex",
                                width: 44,
                                height: 44,
                                borderRadius: 22,
                                border: `2px solid ${on ? EMERALD : ZINC}`,
                                color: on ? EMERALD : "transparent",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 26,
                                textShadow: on ? `0 0 18px ${EMERALD}` : "none",
                            }}
                        >
                            ✓
                        </span>
                        {row}
                    </div>
                );
            })}
            <div
                style={{
                    marginTop: 34,
                    textAlign: "center",
                    opacity: interpolate(frame, [58, 78], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                    }),
                }}
            >
                <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
                    <rect x="5" y="10" width="14" height="10" rx="2" stroke={EMERALD} strokeWidth="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={EMERALD} strokeWidth="2" />
                    <circle cx="12" cy="15" r="1.6" fill={EMERALD} />
                </svg>
                <div style={{ fontFamily: MONO, fontSize: 34, color: PAPER, marginTop: 12 }}>
                    driftlock.dev
                </div>
            </div>
        </AbsoluteFill>
    );
};
