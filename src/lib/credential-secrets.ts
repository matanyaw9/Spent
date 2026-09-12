import { BANK_PROVIDERS } from "./types";

// Keys that must never leave the server once stored: the provider's
// schema-declared password fields, plus a name-based net for anything a
// scraper stashes alongside them (OTP tokens and the like).
const SECRET_KEY_PATTERN = /password|token|secret|otp/i;

export function secretCredentialKeys(
  provider: string | null | undefined
): string[] {
  const info = BANK_PROVIDERS.find((b) => b.id === provider);
  return (
    info?.credentialFields
      .filter((f) => f.type === "password")
      .map((f) => f.key) ?? []
  );
}

export function isSecretCredentialKey(
  provider: string | null | undefined,
  key: string
): boolean {
  return (
    secretCredentialKeys(provider).includes(key) || SECRET_KEY_PATTERN.test(key)
  );
}

export interface RedactedCredentials {
  /** Non-secret fields, safe to prefill an edit form. */
  visible: Record<string, string>;
  /** Schema password fields that currently hold a value. */
  storedSecrets: string[];
}

export function redactCredentials(
  provider: string | null | undefined,
  credentials: Record<string, string>
): RedactedCredentials {
  const visible: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (!isSecretCredentialKey(provider, key)) visible[key] = value;
  }
  const storedSecrets = secretCredentialKeys(provider).filter((key) =>
    Boolean(credentials[key])
  );
  return { visible, storedSecrets };
}
