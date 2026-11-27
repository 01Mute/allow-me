/**
 * A hand-drawn heart: thin, slightly wobbly pencil line over a flat pastel
 * fill, with a little blush hatched on one side. The outline "boils" between
 * three hand-traced versions a few times a second, the way a drawn animation
 * never sits perfectly still.
 */

export type HeartPose = "idle" | "hop" | "rest";

// Three tracings of the same heart, each a little off from the others.
const OUTLINES = [
  "M60 98C48 88 15 66 11 41 8 22 21 9 36 9c11 0 19 7 24 16 4-9 13-16 24-16 15 0 28 13 25 32-4 25-37 47-49 57Z",
  "M60 97C47 88 14 65 10.5 41.5 8 22.5 20 9.5 35.5 8.5c11.5-.5 19.5 7 24.5 16.5 4.5-9.5 13-16 24.5-16 15 .5 27.5 14 24.5 33-4.5 24.5-36.5 46-49 55Z",
  "M60 98.5C48.5 89 15.5 66.5 11.5 40.5 9 21.5 21.5 9.5 36.5 9.5c10.5 0 18.5 6.5 23.5 15.5 4-8.5 12.5-15.5 23.5-15.5 15.5 0 28 13.5 25 31.5-4 25.5-36.5 47.5-48.5 57.5Z",
];

export default function HandHeart({ pose = "idle", size = 180 }: { pose?: HeartPose; size?: number }) {
  return (
    <span
      aria-hidden
      className={`hand-heart block ${pose === "hop" ? "heart-hop" : pose === "rest" ? "heart-rest" : "heart-idle"}`}
      style={{ width: size, height: size * 0.92 }}
    >
      <svg viewBox="0 0 120 110" className="size-full overflow-visible">
        <g className="heart-body">
          {OUTLINES.map((d, i) => (
            <g key={i} className={`boil boil-${i}`}>
              <path d={d} fill="#cfd3f5" />
              <path
                d={d}
                fill="none"
                stroke="#5b4f52"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}
          {/* A soft lighter patch, like a crayon left a little paper showing. */}
          <ellipse cx="38" cy="32" rx="10" ry="6.5" fill="#fff" opacity="0.55" transform="rotate(-25 38 32)" />
          {/* Blush, hatched: three short pink strokes. */}
          <g stroke="#f2a7b5" strokeWidth="2" strokeLinecap="round">
            <path d="M74 56l-4 6" />
            <path d="M80 56l-4 6" />
            <path d="M86 56l-4 6" />
          </g>
        </g>

        {/* Little "!" lines that pop around the heart when it's pressed. */}
        <g className="pop-lines" stroke="#5b4f52" strokeWidth="2" strokeLinecap="round">
          <path d="M14 14l-7-7" />
          <path d="M60 2V-7" />
          <path d="M106 14l7-7" />
        </g>
      </svg>
    </span>
  );
}
