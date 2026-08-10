"use client";

import { useEffect, useRef, useState } from "react";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";

type Stage = "loading" | "idle" | "writing" | "sending" | "sent" | "failed";

export default function PressButton({ slug }: { slug: string }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const storageKey = `pressed:${slug}`;

  // Read after mount so the server and client render the same first pass.
  useEffect(() => {
    let alreadyPressed = false;
    try {
      alreadyPressed = window.localStorage.getItem(storageKey) !== null;
    } catch {
      /* private mode or blocked storage — just show the button. */
    }
    setStage(alreadyPressed ? "sent" : "idle");
  }, [storageKey]);

  useEffect(() => {
    if (stage === "writing") inputRef.current?.focus();
  }, [stage]);

  async function send() {
    setStage("sending");
    try {
      const response = await fetch("/api/press", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, message }),
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

  if (stage === "loading") {
    return <div aria-hidden className="h-64" />;
  }

  if (stage === "sent") {
    return (
      <section className="animate-rise text-center">
        <p className="text-5xl" aria-hidden>
          💌
        </p>
        {/* The heading went away with the copy, so this line carries the h1. */}
        <h1 className="text-muted mt-6 text-[15px] leading-relaxed font-normal">
          알림이 갔습니다.
        </h1>
      </section>
    );
  }

  if (stage === "writing" || stage === "sending" || stage === "failed") {
    const busy = stage === "sending";
    return (
      <section className="animate-rise">
        {/* The only text left in this step, so it takes over as the heading. */}
        <h1 className="text-muted text-[15px] leading-relaxed font-normal">
          하고싶은 말이 있다면..
        </h1>

        <form
          className="mt-6"
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
            className="border-line bg-surface text-ink placeholder:text-muted/60 focus:border-accent w-full rounded-2xl border px-5 py-4 text-[16px] outline-none transition-colors disabled:opacity-60"
          />
          <p className="text-muted mt-2 text-right text-xs tabular-nums">
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
            className="glass-pane glass-pill mt-6 w-full rounded-full px-6 py-4 text-[17px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
          >
            {busy ? "보내는 중…" : stage === "failed" ? "다시 보내기" : "보내기"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setStage("idle")}
          disabled={busy}
          className="text-muted mt-4 w-full py-2 text-sm underline underline-offset-4 disabled:opacity-40"
        >
          조금만, 더
        </button>
      </section>
    );
  }

  return (
    <section className="animate-rise text-center">
      {/* The button is the whole screen now — no copy left to explain it. */}
      <div className="relative mx-auto size-44 opacity-30">
        {/* What the glass refracts. Purely decorative. */}
        <span aria-hidden className="glass-orb-clip">
          <span className="glass-orb" />
        </span>
        <button
          type="button"
          onClick={() => setStage("writing")}
          // The heart is the whole label, so the accessible name has to carry
          // the meaning a screen reader would otherwise get from the text.
          aria-label="마음이 생겼어"
          className="glass-pane flex size-full items-center justify-center rounded-full text-[4.5rem] leading-none text-white transition-transform active:scale-95"
        >
          <span aria-hidden className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.22)]">
            ♥
          </span>
        </button>
      </div>
    </section>
  );
}
