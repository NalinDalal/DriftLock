import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { H, INK, MONO, PAPER, SIGNAL_RED, W, ZINC } from "./theme";

// Beat 1 — HOOK (2s @30fps). The wound, nothing else: one red line
// breathing on black. Mute-safe: the red pulse is the message.
export const Hook: React.FC = () => {
    const frame = useCurrentFrame();
    const glow = interpolate(frame, [0, 30, 60], [0.45, 1, 0.45], {
        extrapolateRight: "clamp",
    });

    return (
        <AbsoluteFill
            style={{
                backgroundColor: INK,
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <div
                style={{
                    fontFamily: MONO,
                    fontSize: 64,
                    color: PAPER,
                    letterSpacing: -1,
                }}
            >
                <span style={{ color: ZINC }}>paymentIntent.</span>
                <span
                    style={{
                        color: SIGNAL_RED,
                        textShadow: `0 0 ${Math.round(38 * glow)}px ${SIGNAL_RED}`,
                        opacity: 0.65 + 0.35 * glow,
                    }}
                >
                    source
                </span>
            </div>
            <div
                style={{
                    position: "absolute",
                    width: W,
                    height: H,
                    boxShadow: `inset 0 0 ${Math.round(220 * glow)}px rgba(255,68,68,0.16)`,
                    pointerEvents: "none",
                }}
            />
        </AbsoluteFill>
    );
};
