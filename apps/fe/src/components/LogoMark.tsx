// Geometry for the DriftLock mark: a lock body with a paper plane sitting in
// it. Source of truth is the clickable theme-toggle prototype in
// src/components/DriftlockLogo.html — this module is the static, app-side
// render of that artwork.
//
// Rendering trick: LOCK and PLANE are merged into one path with fill-rule
// "evenodd". Wherever the plane overlaps the lock body it punches a transparent
// hole (page background shows through), and the parts of the plane that stick
// out past the lock silhouette stay painted. That is exactly the rest state of
// the animated logo, with no need to match a hole fill to the surface behind.

export const DL_W = 288;
export const DL_H = 366;
// Plane pivot, used as the rotation origin while flying.
export const DL_PCX = 143.5;
export const DL_PCY = 246.5;

export const DL_LOCK =
    "M102.0 40.0 L87.0 50.0 L75.0 62.0 L69.0 70.0 L63.0 81.0 L63.0 83.0 L58.0 94.0 L57.0 102.0 L56.0 103.0 L56.0 108.0 L55.0 109.0 L55.0 147.0 L54.0 148.0 L30.0 148.0 L30.0 298.0 L41.0 302.0 L44.0 302.0 L47.0 304.0 L47.0 318.0 L241.0 318.0 L241.0 304.0 L244.0 302.0 L258.0 298.0 L258.0 149.0 L257.0 148.0 L234.0 148.0 L233.0 147.0 L233.0 111.0 L232.0 110.0 L232.0 104.0 L231.0 103.0 L230.0 95.0 L225.0 81.0 L216.0 66.0 L202.0 51.0 L186.0 40.0 L184.0 40.0 L177.0 36.0 L168.0 33.0 L159.0 32.0 L158.0 31.0 L137.0 30.0 L136.0 31.0 L129.0 31.0 L124.0 33.0 L120.0 33.0 L111.0 36.0 L104.0 40.0Z " +
    "M99.0 93.0 L103.0 87.0 L111.0 79.0 L120.0 73.0 L130.0 69.0 L139.0 68.0 L140.0 67.0 L148.0 67.0 L149.0 68.0 L158.0 69.0 L168.0 73.0 L177.0 79.0 L187.0 90.0 L193.0 102.0 L194.0 109.0 L195.0 110.0 L195.0 147.0 L194.0 148.0 L93.0 148.0 L92.0 147.0 L92.0 115.0 L93.0 114.0 L94.0 105.0Z";

export const DL_PLANE =
    "M32.0 297.0 L32.0 299.0 L47.0 303.0 L138.0 257.0 L139.0 258.0 L139.0 318.0 L149.0 318.0 L149.0 258.0 L151.0 257.0 L163.0 263.0 L165.0 265.0 L241.0 303.0 L255.0 299.0 L254.0 296.0 L158.0 233.0 L158.0 200.0 L157.0 199.0 L157.0 194.0 L153.0 182.0 L151.0 179.0 L146.0 175.0 L140.0 176.0 L135.0 182.0 L132.0 189.0 L132.0 193.0 L130.0 199.0 L130.0 208.0 L129.0 209.0 L129.0 233.0 L108.0 248.0 L105.0 249.0 L76.0 269.0 L73.0 270.0 L41.0 292.0Z " +
    "M152.0 327.0 L152.0 345.0 L177.0 352.0 L177.0 345.0Z " +
    "M141.0 327.0 L115.0 345.0 L115.0 352.0 L140.0 345.0 L141.0 344.0Z";

// The rest-state mark: lock filled, plane knocked out where it overlaps the
// body, plane overflow painted in the logo color.
export function LogoMark({ className, fill = "var(--dl-logo)" }: { className?: string; fill?: string }) {
    return (
        <svg
            viewBox={`0 0 ${DL_W} ${DL_H}`}
            fill={fill}
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            <path d={`${DL_LOCK} ${DL_PLANE}`} fillRule="evenodd" />
        </svg>
    );
}
