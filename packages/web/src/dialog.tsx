import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

function keepModalFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab" || event.defaultPrevented) return;
  const dialog = event.currentTarget;
  const controls = [
    ...dialog.querySelectorAll<HTMLElement | SVGElement>(
      "a[href],button,input,select,textarea,summary,[tabindex]"
    )
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      element.closest("[inert]") === null &&
      element.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
  );
  const first = controls[0];
  const last = controls.at(-1);
  const target = event.shiftKey ? last : first;
  if (
    target !== undefined &&
    (document.activeElement === (event.shiftKey ? first : last) ||
      !dialog.contains(document.activeElement))
  ) {
    event.preventDefault();
    target.focus();
  }
}

export function Modal({
  title,
  onClose,
  children,
  className = ""
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef(typeof document === "undefined" ? null : document.activeElement);
  useEffect(() => {
    const previous = returnFocus.current;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onKeyDown={keepModalFocus}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label={`关闭${title}`}>
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
