import { runtimeConfig } from "@/shared/config/runtime-config";

interface HealthResponse {
  apiVersion?: string;
}

let resolvedBaseUrl: Promise<string> | undefined;

async function isCompatibleBackend(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return false;
    const health = await response.json() as HealthResponse;
    return health.apiVersion === "photo-library-demo-v1";
  } catch {
    return false;
  }
}

async function discoverApiBaseUrl(): Promise<string> {
  if (runtimeConfig.apiBaseUrl) return runtimeConfig.apiBaseUrl;
  if (await isCompatibleBackend("")) return "";

  for (const port of [3001, 3002, 3003, 3004, 3005]) {
    const localDevelopmentBackend = `http://127.0.0.1:${port}`;
    if (await isCompatibleBackend(localDevelopmentBackend)) return localDevelopmentBackend;
  }
  return "";
}

export function resolveApiBaseUrl(): Promise<string> {
  resolvedBaseUrl ??= discoverApiBaseUrl();
  return resolvedBaseUrl;
}

export function qualifyApiUrl(baseUrl: string, relativeUrl: string): string {
  return baseUrl ? new URL(relativeUrl, baseUrl).toString() : relativeUrl;
}
