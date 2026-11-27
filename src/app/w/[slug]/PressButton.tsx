"use client";

import { useEffect, useRef, useState } from "react";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";
import HandHeart from "./HandHeart";

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

  const [pressing, setPressing] = useState(false);

  /** Starts a new attempt: fresh id, fresh message. */
  function beginPress() {
    setPressId(newPressId());
    setMessage("");
    setStage("writing");
  }

  // A small hop with a few drawn "!" lines, then the next step — just enough
  // that the tap registers as a moment.
  function pressHeart() {
    if (pressing) return;
    try {
      navigator.vibrate?.(12);
    } catch {
      /* No haptics — the hop is enough. */
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      beginPress();
      return;
    }
    setPressing(true);
    window.setTimeout(() => {
      setPressing(false);
      beginPress();
    }, 620);
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

  return renderStep();

  // A plain render function, not a component: a component defined in here
  // would remount on every keystroke and drop the input's focus.
  function renderStep() {
    if (stage === "loading") {
      return <div aria-hidden className="h-64" />;
    }

    if (stage === "sent") {
      return (
        <section className="relative z-[2] text-center">
          <div className="fade-in mx-auto w-fit">
            <HandHeart pose="rest" size={84} />
          </div>
          {/* The heading went away with the copy, so this line carries the h1. */}
          <h1 className="font-hand fade-up text-ink mt-7 text-[24px] leading-snug font-normal">
            알림이 갔습니다.
          </h1>

          {/* Quiet and low, so it never competes with the moment — but always
              there, so a mistap doesn't need a rescue link from me. */}
          <button
            type="button"
            onClick={undo}
            className="font-hand fade-up-late text-muted mt-12 py-2 text-[17px] underline decoration-1 underline-offset-4"
          >
            실수로 눌렀어요
          </button>
        </section>
      );
    }

    if (stage === "writing" || stage === "sending" || stage === "failed") {
      const busy = stage === "sending";
      return (
        <section className="relative z-[2]">
          <div className="fade-in mx-auto mb-8 w-fit">
            <HandHeart size={64} />
          </div>

          {/* The only text left in this step, so it takes over as the heading. */}
          <h1 className="font-hand fade-up text-ink text-center text-[24px] leading-snug font-normal">
            하고싶은 말이 있다면..
          </h1>

          <form
            className="fade-up-late mt-8"
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
              className="line-input font-hand text-ink placeholder:text-muted/70 w-full px-1 py-2 text-center text-[22px] outline-none disabled:opacity-60"
            />
            <p
              className={`font-hand mt-2 text-right text-[15px] tabular-nums ${
                message.length >= MESSAGE_MAX_LENGTH * 0.9 ? "text-accent" : "text-muted/80"
              }`}
            >
              {message.length} / {MESSAGE_MAX_LENGTH}
            </p>

            {stage === "failed" && (
              <p role="alert" className="font-hand text-accent mt-3 text-center text-[18px]">
                연결이 잘 안 됐어. 한 번만 다시 눌러줄래?
              </p>
            )}

            <div className="mt-8 flex justify-center">
              <button type="submit" disabled={busy} className="soft-button font-hand">
                {busy ? "보내는 중…" : stage === "failed" ? "다시 보내기" : "보내기"}
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={() => setStage("idle")}
            disabled={busy}
            className="font-hand fade-up-late text-muted mt-6 w-full py-2 text-[17px] underline decoration-1 underline-offset-4 disabled:opacity-40"
          >
            조금만, 더
          </button>
        </section>
      );
    }

    return (
      <section className="relative z-[2] text-center">
        {/* The button is the whole screen now — no copy left to explain it. */}
        <button
          type="button"
          onClick={pressHeart}
          disabled={pressing}
          // The heart is the whole label, so the accessible name has to carry
          // the meaning a screen reader would otherwise get from the text.
          aria-label="마음이 생겼어"
          className="fade-in mx-auto block rounded-3xl p-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a9b0e8]"
        >
          <HandHeart pose={pressing ? "hop" : "idle"} />
        </button>
      </section>
    );
  }
}
