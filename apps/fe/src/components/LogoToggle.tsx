import { useEffect, useId, useRef, useState } from "react";
import { DL_H, DL_LOCK, DL_PCX, DL_PCY, DL_PLANE, DL_W } from "./LogoMark";

// Port of the DriftlockLogo click animation (see DriftlockLogo.html for the
// original vanilla script): click = theme flips at takeoff, the plane flies
// NORTH-EAST out of the lock with a tapering contrail, then returns from the
// SOUTH-WEST and settles back into the hole.
//
// Structure differs from the prototype in one way: the resting lock is drawn
// as one evenodd path (LogoMark), so the plane's parked position is already a
// transparent hole. Only the flying copy is rendered live, clipped to the
// region outside the lock so the plane appears to emerge from that hole.

const FLIGHT = 1.2; // seconds the whole flight takes
const EXIT_T = 1.0; // seconds until the plane turns around
const ANGLE = Math.PI / 4; // 45deg = north-east
const TRAIL_SEGS = 16;
// D prototypes the flight distance in SVG units; the demo clamps it against
// the viewport so the plane always clears the screen no matter the button size.
const D_MIN = 700;
const D_MAX = 9000;

type Pose = { dx: number; dy: number; rot: number; op: number };

function makePoses(D: number) {
    function exitPose(t: number): Pose {
        const u = Math.max(t, 0);
        const d = D * Math.pow(u, 1.9);
        const k = Math.min(u / 0.4, 1);
        const rot = 45 * (1 - Math.pow(1 - k, 3));
        const op = u < 0.95 ? 1 : Math.max(0, 1 - (u - 0.95) / 0.2);
        return { dx: d * Math.cos(ANGLE), dy: -d * Math.sin(ANGLE), rot, op };
    }
    function returnPose(t: number): Pose {
        const p = exitPose(FLIGHT - Math.max(0, t));
        return { dx: -p.dx, dy: -p.dy, rot: p.rot, op: p.op };
    }
    return { exitPose, returnPose };
}

function apply(
    pOut: SVGGElement | null,
    segs: Array<SVGPathElement | null>,
    p: Pose,
    t: number,
    poseFn: (t: number) => Pose,
    flying: boolean,
) {
    const tr = `translate(${p.dx} ${p.dy}) rotate(${p.rot} ${DL_PCX} ${DL_PCY})`;
    if (pOut) {
        pOut.setAttribute("transform", tr);
        pOut.setAttribute("opacity", String(flying ? p.op : 1));
    }
    const pts: Array<{ x: number; y: number; op: number }> = [];
    for (let k = 0; k <= TRAIL_SEGS; k++) {
        const tk = t - k * 0.012;
        if (tk < 0) break;
        const q = poseFn(tk);
        pts.push({ x: DL_PCX + q.dx, y: DL_PCY + q.dy, op: q.op });
    }
    segs.forEach((s, i) => {
        if (!s) return;
        if (!flying || i >= pts.length - 1) {
            s.setAttribute("opacity", "0");
            return;
        }
        const a = pts[i];
        const b = pts[i + 1];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const len = Math.hypot(vx, vy) || 1;
        const nx = -vy / len;
        const ny = vx / len;
        const wa = 5 * (1 - i / TRAIL_SEGS);
        const wb = 5 * (1 - (i + 1) / TRAIL_SEGS);
        s.setAttribute(
            "d",
            `M${a.x + nx * wa} ${a.y + ny * wa}L${b.x + nx * wb} ${b.y + ny * wb}L${b.x - nx * wb} ${b.y - ny * wb}L${a.x - nx * wa} ${a.y - ny * wa}Z`,
        );
        s.setAttribute("opacity", String(0.55 * (1 - i / TRAIL_SEGS) * a.op));
    });
}

export function LogoToggle({
    dark,
    onToggle,
    className,
}: {
    dark: boolean;
    onToggle: () => void;
    className?: string;
}) {
    const clipId = useId();
    const btnRef = useRef<HTMLButtonElement>(null);
    const pOutRef = useRef<SVGGElement | null>(null);
    const segsRef = useRef<Array<SVGPathElement | null>>([]);
    const busyRef = useRef(false);
    const [burst, setBurst] = useState(0);

    // Park the plane: empty trail, plane copy at identity so it reproduces the
    // rest-state mark on top of the evenodd base.
    useEffect(() => {
        apply(pOutRef.current, segsRef.current, { dx: 0, dy: 0, rot: 0, op: 1 }, 0, makePoses(D_MIN).exitPose, false);
    }, []);

    function handleClick() {
        if (busyRef.current) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // The theme changes at the same moment the plane takes off.
        onToggle();
        setBurst((n) => n + 1);
        if (reduce) return;
        const r = btnRef.current?.getBoundingClientRect();
        const scale = (r ? r.width : 24) / DL_W;
        const D = Math.min(D_MAX, Math.max(D_MIN, Math.hypot(window.innerWidth, window.innerHeight) / scale));
        const { exitPose, returnPose } = makePoses(D);
        busyRef.current = true;
        const t0 = performance.now();
        const frame = (now: number) => {
            const t = (now - t0) / 1000;
            if (t >= EXIT_T + FLIGHT) {
                apply(pOutRef.current, segsRef.current, { dx: 0, dy: 0, rot: 0, op: 1 }, 0, exitPose, false);
                busyRef.current = false;
                return;
            }
            const poseFn = t < EXIT_T ? exitPose : returnPose;
            const tt = t < EXIT_T ? t : t - EXIT_T;
            apply(pOutRef.current, segsRef.current, poseFn(tt), tt, poseFn, true);
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    return (
        <button
            ref={btnRef}
            onClick={handleClick}
            aria-label="Toggle theme"
            title={dark ? "Switch to light" : "Switch to dark"}
            className={`relative flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)] transition-colors hover:bg-[var(--color-line)] ${className ?? ""}`}
        >
            {burst > 0 && (
                <span key={burst} className="dl-rip" aria-hidden />
            )}
            <svg viewBox={`0 0 ${DL_W} ${DL_H}`} className="h-7 w-auto block overflow-visible" aria-hidden="true" focusable="false">
                <defs>
                    {/* Everything outside the lock body, so the flying plane slides
                        out of the hole instead of drawing over the lock fill. */}
                    <clipPath id={clipId}>
                        <path d={`M-4000 -4000H5000V5000H-4000Z ${DL_LOCK}`} clipRule="evenodd" />
                    </clipPath>
                </defs>
                {/* Rest state: lock with the plane knocked out. */}
                <path d={`${DL_LOCK} ${DL_PLANE}`} fillRule="evenodd" fill="var(--dl-logo)" />
                <g clipPath={`url(#${clipId})`} fill="var(--dl-logo)">
                    <g>
                        {Array.from({ length: TRAIL_SEGS }, (_, i) => (
                            <path
                                key={i}
                                ref={(el) => {
                                    segsRef.current[i] = el;
                                }}
                                d=""
                                opacity={0}
                            />
                        ))}
                    </g>
                    <g ref={pOutRef}>
                        <path d={DL_PLANE} />
                    </g>
                </g>
            </svg>
        </button>
    );
}
