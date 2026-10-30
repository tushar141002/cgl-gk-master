import type { UserData } from "../types";

export const STORAGE_KEY = "cglgk.user.v1";
export const SESSION_KEY = "cglgk.session";

export function defaultUser(): UserData {
  return {
    version: 1,
    createdAt: Date.now(),
    settings: { theme: "system", lang: "en", haptics: true },
    adminPin: "2468",
    stats: {},
    attempts: [],
    bookmarks: [],
    revisions: [],
    daily: {},
    streak: { count: 0, best: 0, lastDay: null },
    activity: {},
    mocks: [],
    overrides: {},
    customTags: [],
  };
}

export function loadUser(): UserData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultUser();
    const parsed = JSON.parse(raw) as Partial<UserData>;
    const base = defaultUser();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      streak: { ...base.streak, ...(parsed.streak ?? {}) },
      stats: parsed.stats ?? {},
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      revisions: Array.isArray(parsed.revisions) ? parsed.revisions : [],
      daily: parsed.daily ?? {},
      activity: parsed.activity ?? {},
      mocks: Array.isArray(parsed.mocks) ? parsed.mocks : [],
      overrides: parsed.overrides ?? {},
      customTags: Array.isArray(parsed.customTags) ? parsed.customTags : [],
      adminPin: typeof parsed.adminPin === "string" && parsed.adminPin ? parsed.adminPin : "2468",
    };
  } catch {
    return defaultUser();
  }
}

export function saveUser(user: UserData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch (err) {
    console.warn("Could not persist CGL GK Master data", err);
    throw new Error("STORAGE_FULL");
  }
}

export function exportUser(user: UserData): string {
  return JSON.stringify(
    {
      app: "CGL GK Master",
      exportedAt: new Date().toISOString(),
      user,
    },
    null,
    2,
  );
}

export function importUser(json: string): UserData {
  const parsed = JSON.parse(json) as { user?: UserData } & Partial<UserData>;
  const candidate = parsed.user ?? (parsed as UserData);
  if (!candidate || typeof candidate !== "object" || !candidate.settings) {
    throw new Error("INVALID_USER_DATA");
  }
  const base = defaultUser();
  return {
    ...base,
    ...candidate,
    settings: { ...base.settings, ...candidate.settings },
    streak: { ...base.streak, ...(candidate.streak ?? {}) },
    attempts: Array.isArray(candidate.attempts) ? candidate.attempts : [],
    bookmarks: Array.isArray(candidate.bookmarks) ? candidate.bookmarks : [],
    revisions: Array.isArray(candidate.revisions) ? candidate.revisions : [],
    mocks: Array.isArray(candidate.mocks) ? candidate.mocks : [],
    overrides: candidate.overrides ?? {},
    customTags: Array.isArray(candidate.customTags) ? candidate.customTags : [],
  };
}

export function storageBytes(): number {
  try {
    return new Blob([localStorage.getItem(STORAGE_KEY) ?? ""]).size;
  } catch {
    return 0;
  }
}
