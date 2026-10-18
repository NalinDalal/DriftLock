import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EMERALD, INK, MONO, PAPER, SIGNAL_RED, ZINC } from "./theme";

const OLD_WORD = "source";
const NEW_WORD = "payment_method";

// Beat 2 — MECHANISM (4s @30fps). Cursor deletes the red word letter by
// letter, types the replacement, line flashes green. One continuous move.
export const Mechanism: React.FC = () => {
    const frame = useCurrentFrame();

    const HOLD = 15; // hold the red line
    const DELETE_PER_CHAR = 5; // frames per deleted letter
    const DELETE_END = HOLD + OLD_WORD.length * DELETE_PER_CHAR; // 45
    const TYPE_PER_CHAR = 3; // frames per typed letter
    const TYPE_END = DELETE_END + NEW_WORD.length * TYPE_PER_CHAR; // 87
    const FLASH_END = 110;

    const deleted = frame < HOLD
        ? 0
        : Math.min(OLD_WORD.length, Math.floor((frame - HOLD) / DELETE_PER_CHAR));
    const typed = frame < DELETE_END
        ? 0
        : Math.min(NEW_WORD.length, Math.floor((frame - DELETE_END) / TYPE_PER_CHAR));

    const editing = frame >= HOLD && frame < TYPE_END;
    // Blink while editing, solid caret once done.
    const caretOn = editing ? frame % 10 < 6 : true;

    const shownOld = OLD_WORD.slice(0, OLD_WORD.length - deleted);
    const shownNew = NEW_WORD.slice(0, typed);
    const done = typed === NEW_WORD.length;

    // Green flash after the word completes.
    const flash = done
        ? interpolate(frame, [TYPE_END, TYPE_END + 8, FLASH_END], [0, 1, 0.35], {
            extrapolateRight: "clamp",
        })
        : 0;

    const wordColor = done ? EMERALD : SIGNAL_RED;
    const glow = done ? 30 * flash + 8 : 26;

    return (
        <AbsoluteFill
            style={{
                backgroundColor: INK,
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <div style={{ fontFamily: MONO, fontSize: 64, letterSpacing: -1 }}>
                <span style={{ color: ZINC }}>paymentIntent.</span>
                {shownOld && (
                    <span
                        style={{
                            color: SIGNAL_RED,
                            textShadow: `0 0 ${glow}px ${SIGNAL_RED}`,
                        }}
                    >
                        {shownOld}
                    </span>
                )}
                {shownNew && (
                    <span
                        style={{
                            color: done ? wordColor : PAPER,
                            textShadow: done
                                ? `0 0 ${Math.round(glow)}px ${EMERALD}`
                                : "none",
                        }}
                    >
                        {shownNew}
                    </span>
                )}
                {caretOn && (
                    <span
                        style={{
                            display: "inline-block",
                            width: 34,
                            height: 62,
                            marginLeft: 6,
                            verticalAlign: -8,
                            backgroundColor: done ? EMERALD : PAPER,
                            opacity: editing ? 1 : 0.85,
                        }}
                    />
                )}
            </div>
        </AbsoluteFill>
    );
};
