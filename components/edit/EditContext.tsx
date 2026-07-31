"use client";

import { createContext, useContext } from "react";

/**
 * Whether the page is being edited, and how to change it.
 *
 * The sections render the same tree for a visitor and for whoever is editing.
 * Outside edit mode this context is absent, `useEdit()` returns null, and every
 * Editable wrapper renders its children and nothing else: no extra elements, no
 * handlers, no cost. That is what lets the editor preview the real page rather
 * than a version of it built for editing.
 */
export type EditApi = {
  /** Current value for a content path, or undefined to use what is rendered. */
  value: (path: string) => string | undefined;
  set: (path: string, value: string) => void;
  upload: (path: string, file: File) => Promise<void>;
  uploading: string | null;
  /** The path currently being edited, so only one thing is focused at a time. */
  active: string | null;
  setActive: (path: string | null) => void;
};

const EditContext = createContext<EditApi | null>(null);

export const EditProvider = EditContext.Provider;

export function useEdit(): EditApi | null {
  return useContext(EditContext);
}
