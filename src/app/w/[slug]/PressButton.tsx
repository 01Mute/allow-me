"use client";

import { useEffect, useRef, useState } from "react";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";

type Stage = "loading" | "idle" | "writing" | "sending" | "sent" | "failed";

/**
 * Identifies one press attempt. `randomUUID` needs a secure context and is
 * missing from some older in-app browsers, so there is a fallback — this only
 * has to be unlikely to collide, not unguessable.
 */
function newPressId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function PressButton({ slug, reset }: { slug: string; reset: boolean }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [message, setMessage] = useState("");
  // Minted per attempt so the server can drop a resend of *this* press without
  // ever dropping a fresh one she meant.
  const [pressId, setPressId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const storageKey = `pressed:${slug}`;

  /** Starts a new attempt: fresh id, fresh message. */
  function beginPress() {
    setPressId(newPressId());
    setMessage("");
    setStage("writing");
  }

  // The press burst plays on the heart before the step changes, so the tap
  // lands as a moment instead of an instant cut.
  const [bursting, setBursting] = useState(false);
  function pressHeart() {
    if (bursting) return;
    try {
      navigator.vibrate?.([12, 60, 18]);
    } catch {
      /* No haptics — the visual burst is enough. */
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      beginPress();
      return;
    }
    setBursting(true);
    window.setTimeout(() => {
      setBursting(false);
      beginPress();
    }, 520);
  }

  // Read after mount so the server and client render the same first pass.
  useEffect(() => {
    let alreadyPressed = false;
    try {
      if (reset) {
        window.localStorage.removeItem(storageKey);
        // Drop ?reset=1 from the address bar so a later revisit — or a reload
        // after she presses it for real — doesn't wipe the state again.
        window.history.replaceState(null, "", window.location.pathname);
      } else {
        alreadyPressed = window.localStorage.getItem(storageKey) !== null;
      }
    } catch {
      /* private mode or blocked storage — just show the button. */
    }
    setStage(alreadyPressed ? "sent" : "idle");
  }, [storageKey, reset]);

  useEffect(() => {
    if (stage === "writing") inputRef.current?.focus();
  }, [stage]);

  async function send() {
    setStage("sending");
    try {
      const response = await fetch("/api/press", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, message, pressId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      try {
        window.localStorage.setItem(storageKey, new Date().toISOString());
      } catch {
        /* Not being able to remember is not a reason to fail the press. */
      }
      setStage("sent");
    } catch {
      // The server swallows its own delivery failures, so reaching here means
      // the request never landed — worth offering a retry.
      setStage("failed");
    }
  }

  /** Puts the button back. Only her browser holds this state, so only it can. */
  function undo() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* Storage blocked — the stage change below still gets her the button. */
    }
    setMessage("");
    setStage("idle");
  }

  if (stage === "loading") {
    return <div aria-hidden className="h-64" />;
  }

  if (stage === "sent") {
    return (
      <section className="text-center">
        <div className="letter-in relative mx-auto size-24" aria-hidden>
          <span className="aura" />
          <LetterIcon />
        </div>
        {/* The heading went away with the copy, so this line carries the h1. */}
        <h1 className="rise-2 text-ink/80 mt-8 text-[15px] leading-relaxed font-normal">
          알림이 갔습니다.
        </h1>

        {/* Quiet and low, so it never competes with the moment — but always
            there, so a mistap doesn't need a rescue link from me. */}
        <button
          type="button"
          onClick={undo}
          className="rise-3 text-muted/70 mt-14 py-2 text-[13px] underline decoration-white/20 underline-offset-4 transition-colors hover:text-muted"
        >
          실수로 눌렀어요
        </button>
      </section>
    );
  }

  if (stage === "writing" || stage === "sending" || stage === "failed") {
    const busy = stage === "sending";
    return (
      <section>
        {/* The only text left in this step, so it takes over as the heading. */}
        <div className="rise-1 flex items-center gap-3">
          <span className="text-accent size-4 shrink-0" aria-hidden>
            <HeartIcon />
          </span>
          <h1 className="text-ink/85 text-[16px] leading-relaxed font-normal">
            하고싶은 말이 있다면..
          </h1>
        </div>

        <form
          className="rise-2 mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void send();
          }}
        >
          <label htmlFor="message" className="sr-only">
            남길 말
          </label>
          <input
            ref={inputRef}
            id="message"
            name="message"
            type="text"
            autoComplete="off"
            maxLength={MESSAGE_MAX_LENGTH}
            disabled={busy}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="비워둬도 됨"
            className="glass-surface text-ink placeholder:text-muted/70 w-full rounded-2xl px-5 py-4 text-[16px] outline-none transition-[border-color,box-shadow] duration-300 focus:border-white/40 disabled:opacity-60"
          />
          <p
            className={`mt-2 text-right text-xs tabular-nums transition-colors ${
              message.length >= MESSAGE_MAX_LENGTH * 0.9 ? "text-accent" : "text-muted/70"
            }`}
          >
            {message.length} / {MESSAGE_MAX_LENGTH}
          </p>

          {stage === "failed" && (
            <p role="alert" className="text-accent mt-4 text-center text-sm">
              연결이 잘 안 됐어. 한 번만 다시 눌러줄래?
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="glass-pane glass-accent heart-press mt-6 w-full rounded-full px-6 py-4 text-[17px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "보내는 중…" : stage === "failed" ? "다시 보내기" : "보내기"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setStage("idle")}
          disabled={busy}
          className="rise-3 text-muted mt-4 w-full py-2 text-sm underline decoration-white/20 underline-offset-4 transition-colors hover:text-ink/80 disabled:opacity-40"
        >
          조금만, 더
        </button>
      </section>
    );
  }

  return (
    <section className="animate-rise text-center">
      {/* The button is the whole screen now — no copy left to explain it. */}
      <div className="relative mx-auto size-44">
        <span aria-hidden className="aura" />
        <div className={bursting ? "relative size-full" : "heartbeat relative size-full"}>
          {!bursting && <span aria-hidden className="beat-ring" />}
          {/* Pink clouds sealed inside the circle, read through the glass. */}
          <span aria-hidden className="plasma-clip">
            <span className="plasma-blob plasma-a" />
            <span className="plasma-blob plasma-b" />
            <span className="plasma-blob plasma-c" />
          </span>
          <button
            type="button"
            onClick={pressHeart}
            // The heart is the whole label, so the accessible name has to carry
            // the meaning a screen reader would otherwise get from the text.
            aria-label="마음이 생겼어"
            className="glass-pane heart-press flex size-full items-center justify-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/50"
          >
            <span aria-hidden className="size-[4.25rem] drop-shadow-[0_2px_12px_rgb(255_255_255_/_0.35)]">
              <HeartIcon />
            </span>
          </button>
        </div>
        {bursting && (
          <span aria-hidden>
            <span className="burst-ring" />
            {BURST.map(([angle, distance], i) => (
              <span
                key={i}
                className="burst-heart"
                style={{ "--a": `${angle}deg`, "--d": `${distance}px` } as React.CSSProperties}
              >
                <HeartIcon />
              </span>
            ))}
          </span>
        )}
      </div>
    </section>
  );
}

/** Angle (deg) and travel (px) for each heart in the press burst. */
const BURST: ReadonlyArray<readonly [number, number]> = [
  [0, 120], [40, 104], [80, 126], [125, 110], [165, 122],
  [205, 106], [245, 124], [290, 112], [330, 118],
];

/**
 * Drawn rather than typed: the ♥ glyph renders differently on every phone
 * font, and on some it falls back to a color emoji.
 */
function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-full">
      <path d="M12 21.2c-.3 0-.6-.1-.8-.3C6.4 16.9 2.5 13.5 2.5 8.9 2.5 6 4.8 3.7 7.6 3.7c1.8 0 3.4.9 4.4 2.4 1-1.5 2.6-2.4 4.4-2.4 2.8 0 5.1 2.3 5.1 5.2 0 4.6-3.9 8-8.7 12-.2.2-.5.3-.8.3Z" />
    </svg>
  );
}

/** Sealed envelope with the heart as its wax seal. Replaces the 💌 emoji. */
function LetterIcon() {
  return (
    <svg viewBox="0 0 96 96" fill="none" className="relative size-full">
      <defs>
        <linearGradient id="env" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(255 255 255 / 0.22)" />
          <stop offset="1" stopColor="rgb(255 255 255 / 0.06)" />
        </linearGradient>
      </defs>
      <rect x="10" y="24" width="76" height="52" rx="10" fill="url(#env)" stroke="rgb(255 255 255 / 0.35)" />
      <path d="M12 28 48 54l36-26" stroke="rgb(255 255 255 / 0.4)" strokeWidth="1.5" strokeLinejoin="round" />
      <g transform="translate(37 42)" className="text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.2c-.3 0-.6-.1-.8-.3C6.4 16.9 2.5 13.5 2.5 8.9 2.5 6 4.8 3.7 7.6 3.7c1.8 0 3.4.9 4.4 2.4 1-1.5 2.6-2.4 4.4-2.4 2.8 0 5.1 2.3 5.1 5.2 0 4.6-3.9 8-8.7 12-.2.2-.5.3-.8.3Z" />
        </svg>
      </g>
    </svg>
  );
}
