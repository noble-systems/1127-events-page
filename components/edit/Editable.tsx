"use client";

import { useEffect, useRef } from "react";
import { useEdit } from "./EditContext";

/**
 * Text you can click and retype, in place.
 *
 * Outside edit mode this is `<>{children}</>` and nothing more, so the public
 * page carries no wrapper elements, no listeners and no extra bytes. Inside it,
 * the same text becomes a contentEditable region.
 *
 * `inline-block` rather than `inline` is load-bearing. An inline element that
 * wraps onto three lines draws three separate outlines, one per line fragment,
 * which looked like a stack of misaligned boxes across a heading. An
 * inline-block wraps its own content and draws one rectangle around all of it.
 *
 * `suppressContentEditableWarning` is deliberate: React warns when it manages
 * the children of a contentEditable node, and here the browser is the one
 * mutating them. The text is read back on blur rather than on every keystroke,
 * so React never fights the caret.
 */
export function Editable({
  path,
  as: Tag = "span",
  className = "",
  children,
}: {
  /** The content key, e.g. "partner.title". */
  path: string;
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3";
  className?: string;
  children: React.ReactNode;
}) {
  const edit = useEdit();
  const ref = useRef<HTMLElement>(null);

  /**
   * Push a value in only when it changed from outside, such as Discard.
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
      onBlur={() => {
        const node = ref.current;
        if (node) edit.set(path, node.innerText.replace(/ /g, " ").trim());
        edit.setActive(null);
      }}
      onKeyDown={(event: React.KeyboardEvent) => {
        // Enter commits rather than inserting a line break: none of these are
        // multi-paragraph fields, and a stray break is invisible until it
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
      className={`${className} edit-target ${
        edit.active === path ? "edit-target-active" : ""
      }`}
    >
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */
/* Lists                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One item of a list, editable in place, with a remove control.
 *
 * Deliberately takes no function props. The first attempt handed a `render`
 * callback to a client component from a server one, which React refuses:
 * "Functions cannot be passed directly to Client Components". The public
 * homepage threw on every request while the build and the whole test suite
 * stayed green, because nothing there renders the page. Only fetching it found
 * the fault.
 *
 * So the section keeps its own map and its own markup, and each item wraps its
 * text in one of these. Nothing crosses the boundary but strings and numbers.
 *
 * The whole list lives in the editor as newline-separated text, which is the
 * shape the save endpoint wants, so an item edits by replacing its own line.
 */
function useList(path: string) {
  const edit = useEdit();
  const lines = (edit?.value(path) ?? "").split("\n");
  return {
    edit,
    lines,
    commit: (next: string[]) =>
      edit?.set(path, next.filter((line) => line.trim() !== "").join("\n")),
  };
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      data-edit-control=""
      title={label}
      aria-label={label}
      onClick={onClick}
      className="text-terracotta/60 hover:text-terracotta ml-1.5 shrink-0 align-middle text-[0.75rem] leading-none opacity-40 transition-opacity duration-150 hover:opacity-100"
    >
      ✕
    </button>
  );
}

export function EditItem({
  path,
  index,
  children,
}: {
  path: string;
  index: number;
  children: React.ReactNode;
}) {
  const { edit, lines, commit } = useList(path);
  const ref = useRef<HTMLSpanElement>(null);

  if (!edit) return <>{children}</>;

  return (
    <>
      <span
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        tabIndex={0}
        aria-label={`Edit item ${index + 1}`}
        data-edit-path={`${path}.${index}`}
        onFocus={() => edit.setActive(`${path}.${index}`)}
        onBlur={(event) => {
          const text = event.currentTarget.innerText.replace(/ /g, " ").trim();
          edit.setActive(null);
          if (text === lines[index]) return;
          const next = [...lines];
          next[index] = text;
          commit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className={`edit-target ${
          edit.active === `${path}.${index}` ? "edit-target-active" : ""
        }`}
      >
        {children}
      </span>
      <RemoveButton
        label={`Remove item ${index + 1}`}
        onClick={() => commit(lines.filter((_, i) => i !== index))}
      />
    </>
  );
}

/**
 * Half of a two-column row, stored as one line with a colon between.
 *
 * `part` is left or right of the colon, not a property name. The details table
 * stores label-then-value and the facts strip stores value-then-label, so
 * naming these after the properties would have meant "label" pointing at
 * different halves in different sections. The field's pairKeys decide which
 * property each half lands in.
 *
 * Editing the halves separately keeps the two-column layout, which editing the
 * raw line would have flattened. Only the first colon separates, because values
 * contain colons.
 */
export function EditPair({
  path,
  index,
  part,
  children,
}: {
  path: string;
  index: number;
  part: "left" | "right";
  children: React.ReactNode;
}) {
  const { edit, lines, commit } = useList(path);

  if (!edit) return <>{children}</>;

  const key = `${path}.${index}.${part}`;
  const line = lines[index] ?? "";
  const at = line.indexOf(":");
  const left = (at === -1 ? line : line.slice(0, at)).trim();
  const right = at === -1 ? "" : line.slice(at + 1).trim();

  return (
    <>
      <span
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        tabIndex={0}
        aria-label={`Edit row ${index + 1}, ${part} half`}
        data-edit-path={key}
        onFocus={() => edit.setActive(key)}
        onBlur={(event) => {
          // A colon typed into either half would split the row somewhere new,
          // so it is folded to a dash rather than silently rewriting the pair.
          const text = event.currentTarget.innerText
            .replace(/ /g, " ")
            .replace(/:/g, " -")
            .trim();
          edit.setActive(null);
          const next = [...lines];
          next[index] =
            part === "left" ? `${text}: ${right}` : `${left}: ${text}`;
          if (next[index] === lines[index]) return;
          commit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className={`edit-target ${edit.active === key ? "edit-target-active" : ""}`}
      >
        {children}
      </span>
      {part === "left" ? (
        <RemoveButton
          label={`Remove row ${index + 1}`}
          onClick={() => commit(lines.filter((_, i) => i !== index))}
        />
      ) : null}
    </>
  );
}

/**
 * Appends an item. Renders nothing outside the editor.
 *
 * The wording lives here rather than arriving as a prop. A client component's
 * props are serialised into the payload the public page ships even when the
 * component renders null, so a `label="Add row"` prop put those words on the
 * live homepage twice. A short variant flag costs four bytes and says nothing.
 */
const ADD_LABEL = {
  item: { text: "Add item", blank: "New item" },
  row: { text: "Add row", blank: "Label: value" },
  paragraph: { text: "Add paragraph", blank: "New paragraph" },
} as const;

export function EditAdd({
  path,
  variant = "item",
}: {
  path: string;
  variant?: keyof typeof ADD_LABEL;
}) {
  const { edit, lines, commit } = useList(path);
  if (!edit) return null;

  const { text, blank } = ADD_LABEL[variant];

  return (
    <button
      type="button"
      data-edit-control=""
      onClick={() => commit([...lines, blank])}
      className="text-cobalt mt-3 text-[0.875rem] underline-offset-4 hover:underline"
    >
      + {text}
    </button>
  );
}
