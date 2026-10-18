import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EMERALD, INK, MONO, PAPER, SIGNAL_RED, ZINC } from "./theme";

const OLD_WORD = "source";
const NEW_WORD = "payment_method";

// Homepage hero loop (5s @30fps, silent). Self-contained and loop-safe:
// fades in from black and back out, so last frame matches first.
export const HeroLoop: React.FC = () => {
    const frame = useCurrentFrame();

    const FADE_IN = 10;
    const HOLD = 28;
    const DELETE_END = HOLD + OLD_WORD.length * 5; // 58
    const TYPE_END = DELETE_END + NEW_WORD.length * 3; // 100
    const FADE_OUT_START = 138;

    const deleted = frame < HOLD
        ? 0
        : Math.min(OLD_WORD.length, Math.floor((frame - HOLD) / 5));
    const typed = frame < DELETE_END
        ? 0
        : Math.min(NEW_WORD.length, Math.floor((frame - DELETE_END) / 3));

    const editing = frame >= HOLD && frame < TYPE_END;
    const caretOn = editing ? frame % 10 < 6 : frame >= TYPE_END;
    const done = typed === NEW_WORD.length;

    const fadeIn = interpolate(frame, [0, FADE_IN], [0, 1], {
        extrapolateRight: "clamp",
    });
    const fadeOut = interpolate(frame, [FADE_OUT_START, 150], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });
    const opacity = Math.min(fadeIn, fadeOut);

    // Gentle red breathing before the edit starts.
    const breathe = !done && !editing
        ? interpolate(frame, [0, HOLD], [0.5, 1], { extrapolateRight: "clamp" })
        : 1;

    return (
        <AbsoluteFill
            style={{
                backgroundColor: INK,
                justifyContent: "center",
                alignItems: "center",
                opacity,
            }}
        >
            <div style={{ fontFamily: MONO, fontSize: 56, letterSpacing: -1 }}>
                <span style={{ color: ZINC }}>paymentIntent.</span>
                {OLD_WORD.slice(0, OLD_WORD.length - deleted) && (
                    <span
                        style={{
                            color: SIGNAL_RED,
                            opacity: 0.6 + 0.4 * breathe,
                            textShadow: `0 0 26px ${SIGNAL_RED}`,
                        }}
                    >
                        {OLD_WORD.slice(0, OLD_WORD.length - deleted)}
                    </span>
                )}
                {NEW_WORD.slice(0, typed) && (
                    <span
                        style={{
                            color: done ? EMERALD : PAPER,
                            textShadow: done ? `0 0 24px ${EMERALD}` : "none",
                        }}
                    >
                        {NEW_WORD.slice(0, typed)}
                    </span>
                )}
                {caretOn && (
                    <span
                        style={{
                            display: "inline-block",
                            width: 30,
                            height: 54,
                            marginLeft: 6,
                            verticalAlign: -7,
                            backgroundColor: done ? EMERALD : PAPER,
                            opacity: 0.9,
                        }}
                    />
                )}
            </div>
        </AbsoluteFill>
    );
};
