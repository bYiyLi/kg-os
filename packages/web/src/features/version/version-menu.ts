import type { KeyboardEvent } from "react";

// Popovers keep their search input; arrow keys move through the actual choices.
export function moveVersionMenuFocus(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const editing =
    event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (editing && (event.key === "Home" || event.key === "End")) return;
  const choices = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-version-option]:not(:disabled)")
  );
  if (choices.length === 0) return;
  event.preventDefault();
  const current = choices.findIndex((choice) => choice === document.activeElement);
  const direction = event.key === "ArrowDown" ? 1 : -1;
  let next = (current + direction + choices.length) % choices.length;
  if (current === -1) next = direction > 0 ? 0 : choices.length - 1;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = choices.length - 1;
  choices[next]?.focus();
}
