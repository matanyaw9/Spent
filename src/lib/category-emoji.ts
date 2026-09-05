/**
 * The category `icon` column holds either an emoji (the modern form) or a
 * legacy lucide slug like "shopping-basket" from before migration 022.
 * Returns the emoji to display, or null when there is none: slugs are
 * ASCII-only, so anything outside plain [a-z0-9-] text is treated as emoji.
 */
export function categoryEmoji(icon: string | null | undefined): string | null {
  if (!icon) return null;
  const trimmed = icon.trim();
  if (!trimmed || /^[a-z0-9-]+$/i.test(trimmed)) return null;
  return trimmed;
}
