"use client";

import * as React from "react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

import Image from "@/components/ImageSafe";
import { getHeroSlides } from "@/lib/heroSlides";
import { trackHeroImpression, trackHeroClick } from "@/lib/heroAnalytics";
import { cloudflareImagesLoader } from "@/lib/cfImages";

const AUTO_PLAY_MS = 7000;

// Swipe tuning (snap behavior)
const SWIPE_MIN_PX = 42; // minimum distance to count as swipe
const SWIPE_MAX_OFF_AXIS_PX = 90; // ignore if too vertical (scroll intent)
const DRAG_CLICK_SUPPRESS_MS = 250; // prevent accidental click after swipe

type LocalHeroSlide = {
  id: string | number;
  title: string;
  description?: string;
  alt?: string;
  ctaHref?: string;
  // allow other properties from the source so runtime fields can be accessed
  [key: string]: any;
};

type SlideWithExtras = LocalHeroSlide & {
  imageUrl?: string;
  badge?: string;
  focal?: string; // "50% 50%"
  ctaText?: string;
};

function safeTrackImpression(id: string | number, ctaText?: string) {
  try {
    (trackHeroImpression as unknown as (id: string | number, ctaText?: string) => void)(id, ctaText);
  } catch {
    // noop
  }
}

function safeTrackClick(id: string | number, ctaText?: string) {
  try {
    (trackHeroClick as unknown as (id: string | number, ctaText?: string) => void)(id, ctaText);
  } catch {
    // noop
  }
}

function clampIndex(i: number, len: number) {
  if (len <= 0) return 0;
  return ((i % len) + len) % len;
}

function normFocal(v: unknown): string {
  const s = String(v ?? "").trim();
  return s && s.length <= 32 ? s : "50% 50%";
}

function safeAlt(v: unknown): string {
  // Next/Image expects a string alt (not undefined)
  const s = typeof v === "string" ? v.trim() : "";
  return s || "";
}

type DragState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  moved: boolean;
};

export default function Hero() {
  const slides = useMemo<SlideWithExtras[]>(() => {
    const raw = (getHeroSlides?.() ?? []) as SlideWithExtras[];
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  }, []);

  const [index, setIndex] = useState(0);
  const timerRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);
  const mountedRef = useRef(true);

  const dragRef = useRef<DragState>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startedAt: 0,
    moved: false,
  });

  const suppressClickUntilRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    clearTimer();
    if (!hoveringRef.current && slides.length > 1) {
      timerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        setIndex((i) => clampIndex(i + 1, slides.length));
      }, AUTO_PLAY_MS);
    }
  }, [clearTimer, slides.length]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    schedule();
  }, [index, schedule]);

  useEffect(() => {
    const s = slides[index];
    if (!s) return;
    safeTrackImpression(s.id, (s as any).ctaText);
  }, [index, slides]);

  const goTo = useCallback(
    (i: number) => {
      if (!slides.length) return;
      setIndex(clampIndex(i, slides.length));
    },
    [slides.length]
  );

  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);

  const onEnter = useCallback(() => {
    hoveringRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const onLeave = useCallback(() => {
    hoveringRef.current = false;
    schedule();
  }, [schedule]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (slides.length <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    },
    [next, prev, slides.length]
  );

  // ---- Swipe / drag (snap) ----
  const startDrag = useCallback(
    (pointerId: number, x: number, y: number) => {
      dragRef.current = {
        active: true,
        pointerId,
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        startedAt: Date.now(),
        moved: false,
      };
      hoveringRef.current = true; // pause autoplay while interacting
      clearTimer();
    },
    [clearTimer]
  );

  const moveDrag = useCallback((x: number, y: number) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.lastX = x;
    d.lastY = y;
    if (!d.moved && (Math.abs(x - d.startX) > 4 || Math.abs(y - d.startY) > 4)) d.moved = true;
  }, []);

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d.active) return;

    const dx = d.lastX - d.startX;
    const dy = d.lastY - d.startY;

    // reset drag
    dragRef.current.active = false;
    dragRef.current.pointerId = null;

    // resume autoplay
    hoveringRef.current = false;

    // If mostly vertical, assume scroll; do nothing.
    if (Math.abs(dy) > SWIPE_MAX_OFF_AXIS_PX && Math.abs(dy) > Math.abs(dx)) {
      schedule();
      return;
    }

    // Snap: if dx passes threshold, change slide
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
      // suppress click-through when user swiped
      suppressClickUntilRef.current = Date.now() + DRAG_CLICK_SUPPRESS_MS;

      if (dx < 0) next();
      else prev();
    }

    schedule();
  }, [next, prev, schedule]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (slides.length <= 1) return;
      // Only left click for mouse; all touches allowed
      if (e.pointerType === "mouse" && e.button !== 0) return;

      // Capture pointer so we keep getting events even if pointer leaves element
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      startDrag(e.pointerId, e.clientX, e.clientY);
    },
    [slides.length, startDrag]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d.active) return;

      // If dragging, prevent text selection and reduce accidental interactions
      if (d.moved) e.preventDefault();
      moveDrag(e.clientX, e.clientY);
    },
    [moveDrag]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      if (d.pointerId !== e.pointerId) return;
      endDrag();
    },
    [endDrag]
  );

  const onPointerCancel = useCallback(() => {
    if (!dragRef.current.active) return;
    endDrag();
  }, [endDrag]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    // block click if a swipe happened very recently
    if (Date.now() < suppressClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  if (!slides.length) return null;

  return (
    <section className="hero" aria-label="Featured promotions" data-hero>
      <div
        className="hero__frame"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        tabIndex={0}
      >
        {slides.map((s, i) => {
          const active = i === index;
          const img = String((s as any).imageUrl ?? "").trim();
          const focal = normFocal((s as any).focal);
          const alt = safeAlt(s.alt);

          return (
            <article
              key={String(s.id)}
              className={`hero__slide${active ? " is-active" : ""}`}
              aria-hidden={!active}
              aria-roledescription="slide"
            >
              {/* Ambient edge fill (subtle). */}
              {img ? (
                <Image
                  loader={cloudflareImagesLoader}
                  src={img}
                  alt=""
                  aria-hidden="true"
                  fill
                  sizes="(min-width:1280px) 1280px, 100vw"
                  className="hero__img hero__img--ambient"
                  draggable={false}
                  unoptimized
                />
              ) : null}

              {/* Real image — locked to contain so it never crops. */}
              {img ? (
                <Image
                  loader={cloudflareImagesLoader}
                  src={img}
                  alt={alt}
                  fill
                  priority={i === 0}
                  sizes="(min-width:1280px) 1280px, 100vw"
                  className="hero__img hero__img--main"
                  style={{ objectPosition: focal }}
                  draggable={false}
                  unoptimized
                />
              ) : (
                <div className="hero__noimg" aria-hidden="true" />
              )}

              {/* Overlays */}
              <div className="hero__gradLeft" aria-hidden="true" />
              <div className="hero__gradRight" aria-hidden="true" />

              {/* Caption */}
              <div className="hero__caption">
                <div className="hero__captionInner">
                  {Boolean((s as any).badge) ? (
                    <span className="hero__badge">{String((s as any).badge)}</span>
                  ) : null}

                  <h1 className="hero__title">{s.title}</h1>

                  {s.description ? <p className="hero__desc">{s.description}</p> : null}

                  {s.ctaHref && (s as any).ctaText ? (
                    <div className="hero__ctaRow">
                      <Link
                        href={s.ctaHref}
                        onClick={() => safeTrackClick(s.id, (s as any).ctaText)}
                        className="hero__cta"
                      >
                        {String((s as any).ctaText)}
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}

        {slides.length > 1 ? (
          <>
            {/* Arrows */}
            <button
              type="button"
              onClick={prev}
              aria-label="Previous slide"
              className="hero__arrow hero__arrow--left"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next slide"
              className="hero__arrow hero__arrow--right"
            >
              ›
            </button>

            {/* Dots */}
            <div className="hero__dots" role="tablist" aria-label="Hero slides">
              {slides.map((_, i) => {
                const active = i === index;
                return (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={active}
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => goTo(i)}
                    className={`hero__dot${active ? " is-active" : ""}`}
                  />
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
