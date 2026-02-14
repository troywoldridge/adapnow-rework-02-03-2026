"use client";

import { useCallback } from "react";

declare global {
  interface Window {
    supportChat?: {
      open?: () => void;
    };
  }
}

export type ChatButtonProps = {
  /**
   * Button label text.
   */
  label?: string;

  /**
   * Optional CSS class override/add-on.
   */
  className?: string;

  /**
   * If true, the button is disabled.
   */
  disabled?: boolean;

  /**
   * Optional click handler (runs after opening chat).
   */
  onOpened?: () => void;
};

export default function ChatButton({
  label = "Chat With An Agent",
  className = "",
  disabled = false,
  onOpened,
}: ChatButtonProps) {
  const onClick = useCallback(() => {
    const open = window.supportChat?.open;
    if (typeof open === "function") {
      open();
      onOpened?.();
      return;
    }

    // If chat hasn't loaded yet, keep this quiet in prod.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[ChatButton] window.supportChat.open is not available.");
    }
  }, [onOpened]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-chat ${className}`.trim()}
      aria-label={label}
    >
      {label}
    </button>
  );
}
