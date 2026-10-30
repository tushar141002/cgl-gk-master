import type { SessionConfig } from "../types";
import { SESSION_KEY } from "./storage";

export function saveSession(config: SessionConfig): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(config));
  } catch {
    // Private-mode storage can fail; the session just won't survive a reload.
  }
}

export function readSession(): SessionConfig | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionConfig;
    if (!parsed || typeof parsed.mode !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
