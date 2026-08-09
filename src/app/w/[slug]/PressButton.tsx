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
        <h1 className="text-ink mt-6 text-2xl font-semibold tracking-tight">전해졌어.</h1>
        <p className="text-muted mt-3 text-[15px] leading-relaxed">
          방금 알림이 갔어.
          <br />
          곧 연락할게.
        </p>
      </section>
    );
  }

  if (stage === "writing" || stage === "sending" || stage === "failed") {
    const busy = stage === "sending";
    return (
      <section className="animate-rise">
        <h1 className="text-ink text-2xl font-semibold tracking-tight">한마디 남겨줄래?</h1>
        <p className="text-muted mt-3 text-[15px] leading-relaxed">
          안 써도 괜찮아. 눌렀다는 것만으로 충분해.
        </p>

        <form
          className="mt-8"
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
            placeholder="( 비워둬도 돼 )"
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
            className="bg-accent mt-6 w-full rounded-full px-6 py-4 text-[17px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
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
          잠깐만, 뒤로
        </button>
      </section>
    );
  }

  return (
    <section className="animate-rise text-center">
      <p className="text-muted text-[15px]">언젠가, 마음이 생긴다면</p>
      <h1 className="text-ink mt-3 text-2xl leading-snug font-semibold tracking-tight">
        그때 이 버튼을 눌러줘
      </h1>

      <button
        type="button"
        onClick={() => setStage("writing")}
        className="animate-breathe bg-accent mx-auto mt-14 flex size-44 items-center justify-center rounded-full text-[17px] font-semibold text-white transition-transform active:scale-95"
      >
        마음이 생겼어
      </button>

      <p className="text-muted mt-14 text-[13px] leading-relaxed">
        누르면 나한테 바로 알림이 가.
        <br />
        서두르지 않아도 돼.
      </p>
    </section>
  );
}
