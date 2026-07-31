"use client";

import { useEffect, useRef } from "react";
import { useEdit } from "./EditContext";

/**
 * Text you can click and retype, in place.
 *
 * Outside edit mode this is `<>{children}</>` and nothing more, so the public
 * page carries no wrapper elements, no listeners and no extra bytes. Inside it,
 * the same text becomes a contentEditable region with an outline on hover.
 *
 * `suppressContentEditableWarning` is deliberate: React warns when it manages
 * the children of a contentEditable node, and here the browser is the one
 * mutating them. We read the text back on blur rather than on every keystroke,
 * so React never fights the caret.
 */
export function Editable({
  path,
  as: Tag = "span",
  className = "",
  children,
}: {
  /** The content key, e.g. "hero.body". */
  path: string;
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3";
  className?: string;
  children: React.ReactNode;
}) {
  const edit = useEdit();
  const ref = useRef<HTMLElement>(null);

  /**
   * Push the value in only when it changed from outside, such as Discard.
   *
   * Writing on every render would reset the caret to the start of the line
   * halfway through a word.
   */
  const incoming = edit?.value(path);
  useEffect(() => {
    const node = ref.current;
    if (!node || incoming === undefined) return;
    if (node.innerText !== incoming) node.innerText = incoming;
  }, [incoming]);

  if (!edit) return <>{children}</>;

  const commit = () => {
    const node = ref.current;
    if (node) edit.set(path, node.innerText.replace(/ /g, " ").trim());
    edit.setActive(null);
  };

  return (
    <Tag
      ref={ref as React.Ref<never>}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      tabIndex={0}
      aria-label={`Edit ${path}`}
      data-edit-path={path}
      onFocus={() => edit.setActive(path)}
      onBlur={commit}
      onKeyDown={(event: React.KeyboardEvent) => {
        // Enter commits rather than inserting a line break: none of these are
        // multi-paragraph fields, and a stray <br> is invisible until it
        // reaches the live page.
        if (event.key === "Enter") {
          event.preventDefault();
          (event.currentTarget as HTMLElement).blur();
        }
        if (event.key === "Escape") {
          const node = ref.current;
          if (node && incoming !== undefined) node.innerText = incoming;
          (event.currentTarget as HTMLElement).blur();
        }
      }}
      className={`${className} cursor-text rounded-[3px] outline-none ring-offset-2 transition-shadow duration-150 hover:ring-2 hover:ring-cobalt/40 focus:ring-2 focus:ring-cobalt ${
        edit.active === path ? "ring-2 ring-cobalt" : ""
      }`}
    >
      {children}
    </Tag>
  );
}

/**
 * A block of paragraphs, edited as one region.
 *
 * The stored value is a list, one entry per paragraph, and pressing Enter here
 * makes a new one. Editing each paragraph separately would have been simpler
 * but leaves no way to add or remove one without opening the form editor.
 */
export function EditableList({
  path,
  className = "",
  children,
}: {
  path: string;
  className?: string;
  children: React.ReactNode;
}) {
  const edit = useEdit();
  const ref = useRef<HTMLDivElement>(null);

  const incoming = edit?.value(path);
  useEffect(() => {
    const node = ref.current;
    if (!node || incoming === undefined) return;
    const shown = node.innerText.replace(/ /g, " ");
    if (shown.split("\n").map((l) => l.trim()).filter(Boolean).join("\n") !== incoming) {
      node.innerText = incoming;
    }
  }, [incoming]);

  if (!edit) return <>{children}</>;

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
      tabIndex={0}
      aria-label={`Edit ${path}`}
      data-edit-path={path}
      onFocus={() => edit.setActive(path)}
      onBlur={() => {
        const node = ref.current;
        if (node) {
          // Blank lines are dropped, matching normaliseValue, so what you see
          // after blurring is what the page will actually render.
          const lines = node.innerText
            .replace(/ /g, " ")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          edit.set(path, lines.join("\n"));
        }
        edit.setActive(null);
      }}
      className={`${className} cursor-text rounded-[3px] outline-none ring-offset-2 transition-shadow duration-150 hover:ring-2 hover:ring-cobalt/40 focus:ring-2 focus:ring-cobalt ${
        edit.active === path ? "ring-2 ring-cobalt" : ""
      }`}
    >
      {children}
    </div>
  );
}
