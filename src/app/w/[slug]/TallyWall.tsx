/**
 * Days scratched into the wall, the way someone stuck in a cave counts them:
 * four uprights and a fifth stroke slashed across. One mark per day, added at
 * Seoul midnight.
 *
 * Rendered on the server so the count comes from one clock — the page is
 * force-dynamic, so every visit recomputes it.
 */

import { MARKS_PER_GROUP, daysElapsed, groupMarks } from "@/lib/tally";

/**
 * Deterministic wobble in [-range, range]. Perfectly straight strokes look
 * printed; these should look scratched by hand.
 */
function wobble(seed: number, range: number): number {
  const noise = Math.sin(seed * 12.9898) * 43758.5453;
  return ((noise - Math.floor(noise)) * 2 - 1) * range;
}

function TallyGroup({ count, seed }: { count: number; seed: number }) {
  const strokes = [];

  for (let i = 0; i < Math.min(count, MARKS_PER_GROUP - 1); i++) {
    const x = 5 + i * 8;
    strokes.push(
      <line
        key={i}
        x1={x + wobble(seed + i, 1.2)}
        y1={4 + wobble(seed + i + 0.5, 1.5)}
        x2={x + wobble(seed + i + 1.5, 1.6)}
        y2={36 + wobble(seed + i + 2.5, 1.5)}
      />,
    );
  }

  // The fifth day is the stroke slashed across the other four.
  if (count === MARKS_PER_GROUP) {
    strokes.push(
      <line
        key="slash"
        x1={1 + wobble(seed + 7, 1.5)}
        y1={32 + wobble(seed + 8, 1.5)}
        x2={33 + wobble(seed + 9, 1.5)}
        y2={9 + wobble(seed + 10, 1.5)}
      />,
    );
  }

  return (
    <svg
      width="34"
      height="40"
      viewBox="0 0 34 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      {strokes}
    </svg>
  );
}

export default function TallyWall() {
  const groups = groupMarks(daysElapsed(new Date()));

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden text-white/[0.13]"
    >
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-6 px-6 pt-14">
        {groups.map((count, index) => (
          <TallyGroup key={index} count={count} seed={index * 3.7 + 1} />
        ))}
      </div>
    </div>
  );
}
