import "server-only";

import { getDb } from "../index";
import type { AppSettings } from "@/lib/types";
import { CATEGORY_COLOR_PALETTE } from "@/lib/category-palette";

// Global settings live in the `settings` table and apply to every workspace.
// Currently: ai_provider, ai_ollama_url, ai_ollama_model, plus the encrypted
// Claude API key triple (ai_api_key_encrypted/iv/auth_tag).
export function getGlobalSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setGlobalSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value);
}

export function deleteGlobalSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

// Per-workspace settings live in `workspace_settings`.
// Currently: months_to_sync, payday_day, scraper_show_browser.
export function getWorkspaceSetting(
  workspaceId: number,
  key: string
): string | null {
  const row = getDb()
    .prepare(
      "SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = ?"
    )
    .get(workspaceId, key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setWorkspaceSetting(
  workspaceId: number,
  key: string,
  value: string
): void {
  getDb()
    .prepare(
      `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .run(workspaceId, key, value);
}

// Back-compat aliases so existing call sites that store the Claude API key
// (settings.ts in src/server/ai/providers/claude.ts) keep working unchanged.
export const getSetting = getGlobalSetting;
export const setSetting = setGlobalSetting;

const AUTO_SYNC_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function getAppSettings(workspaceId: number): AppSettings {
  const targetRaw = getWorkspaceSetting(workspaceId, "monthly_target");
  const target = targetRaw != null ? Number(targetRaw) : NaN;
  const storedTime = getGlobalSetting("auto_sync_time");
  const storedLang = getGlobalSetting("language");
  return {
    monthsToSync: Number(getWorkspaceSetting(workspaceId, "months_to_sync") ?? "3"),
    categoryPalette: readCategoryPalette(workspaceId),
    aiProvider: (getGlobalSetting("ai_provider") ?? "none") as AppSettings["aiProvider"],
    ollamaUrl: getGlobalSetting("ai_ollama_url") ?? "http://localhost:11434",
    ollamaModel: getGlobalSetting("ai_ollama_model") ?? "llama3.2:3b",
    showBrowser: getWorkspaceSetting(workspaceId, "scraper_show_browser") === "true",
    paydayDay: Number(getWorkspaceSetting(workspaceId, "payday_day") ?? "1"),
    monthlyTarget: Number.isFinite(target) && target > 0 ? target : null,
    autoSyncEnabled: getGlobalSetting("auto_sync_enabled") === "true",
    autoSyncTime:
      storedTime && AUTO_SYNC_TIME_RE.test(storedTime) ? storedTime : "06:00",
    language: storedLang === "he" ? "he" : "en",
  };
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_PALETTE_COLORS = 36;

function parseHexArray(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((c): c is string => typeof c === "string" && HEX_COLOR_RE.test(c))
      .slice(0, MAX_PALETTE_COLORS);
  } catch {
    return null;
  }
}

/**
 * The whole swatch palette is user-editable per workspace. Unset falls
 * back to the built-in colors (plus any colors saved under the older
 * custom-colors key, so nothing a user picked disappears).
 */
function readCategoryPalette(workspaceId: number): string[] {
  const stored = parseHexArray(
    getWorkspaceSetting(workspaceId, "category_palette")
  );
  if (stored) return stored;
  const legacyCustom =
    parseHexArray(getWorkspaceSetting(workspaceId, "custom_category_colors")) ??
    [];
  return [...CATEGORY_COLOR_PALETTE, ...legacyCustom].slice(
    0,
    MAX_PALETTE_COLORS
  );
}

export function updateAppSettings(
  workspaceId: number,
  settings: Partial<AppSettings>
): AppSettings {
  const db = getDb();
  const update = db.transaction(() => {
    if (settings.monthsToSync !== undefined) {
      setWorkspaceSetting(workspaceId, "months_to_sync", String(settings.monthsToSync));
    }
    if (settings.aiProvider !== undefined) {
      setGlobalSetting("ai_provider", settings.aiProvider);
    }
    if (settings.ollamaUrl !== undefined) {
      setGlobalSetting("ai_ollama_url", settings.ollamaUrl);
    }
    if (settings.ollamaModel !== undefined) {
      setGlobalSetting("ai_ollama_model", settings.ollamaModel);
    }
    if (settings.showBrowser !== undefined) {
      setWorkspaceSetting(
        workspaceId,
        "scraper_show_browser",
        settings.showBrowser ? "true" : "false"
      );
    }
    if (settings.paydayDay !== undefined) {
      const clamped = Math.max(1, Math.min(28, Math.round(settings.paydayDay)));
      setWorkspaceSetting(workspaceId, "payday_day", String(clamped));
    }
    if (settings.monthlyTarget !== undefined) {
      const t = settings.monthlyTarget;
      if (t == null || !Number.isFinite(t) || t <= 0) {
        getDb()
          .prepare(
            "DELETE FROM workspace_settings WHERE workspace_id = ? AND key = ?"
          )
          .run(workspaceId, "monthly_target");
      } else {
        setWorkspaceSetting(workspaceId, "monthly_target", String(Math.round(t)));
      }
    }
    if (settings.autoSyncEnabled !== undefined) {
      setGlobalSetting(
        "auto_sync_enabled",
        settings.autoSyncEnabled ? "true" : "false"
      );
    }
    if (settings.autoSyncTime !== undefined) {
      if (!AUTO_SYNC_TIME_RE.test(settings.autoSyncTime)) {
        throw new Error("autoSyncTime must be HH:MM 24-hour");
      }
      setGlobalSetting("auto_sync_time", settings.autoSyncTime);
    }
    if (settings.language !== undefined) {
      if (settings.language !== "en" && settings.language !== "he") {
        throw new Error("language must be 'en' or 'he'");
      }
      setGlobalSetting("language", settings.language);
    }
    if (settings.categoryPalette !== undefined) {
      if (
        !Array.isArray(settings.categoryPalette) ||
        !settings.categoryPalette.every(
          (c) => typeof c === "string" && HEX_COLOR_RE.test(c)
        )
      ) {
        throw new Error("categoryPalette must be #rrggbb hex strings");
      }
      const deduped = [...new Set(settings.categoryPalette)].slice(
        0,
        MAX_PALETTE_COLORS
      );
      setWorkspaceSetting(
        workspaceId,
        "category_palette",
        JSON.stringify(deduped)
      );
    }
  });
  update();
  return getAppSettings(workspaceId);
}
