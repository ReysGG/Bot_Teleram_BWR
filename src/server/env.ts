import { z } from "zod";

const positiveInteger = z.coerce.number().int().positive();

export function requireEnv(name: string, minimumLength = 1): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} must be configured`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function booleanEnv(name: string, fallback: boolean): boolean {
  const value = optionalEnv(name);
  if (!value) return fallback;
  return value.toLowerCase() === "true";
}

export function integerEnv(name: string, fallback: number): number {
  const value = optionalEnv(name);
  return value ? positiveInteger.parse(value) : fallback;
}

export function appUrl(): URL {
  return new URL(optionalEnv("APP_URL") ?? "http://localhost:3000");
}

export function appRoute(path: string): URL {
  return new URL(path, appUrl());
}

export function adminChatIds(): Set<string> {
  return new Set(
    (optionalEnv("TELEGRAM_ADMIN_CHAT_IDS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}
