import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

const environmentSchema = z.object({
  BACKEND_HOST: z.string().default("127.0.0.1"),
  BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATA_ROOT: z.string().optional(),
  SELFIES_DIR: z.string().optional(),
  MAX_STILL_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  MAX_MOTION_BYTES: z.coerce.number().int().positive().default(250 * 1024 * 1024),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-flash"),
  MODEL_GATEWAY_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  MODEL_GATEWAY_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  DEEPSEEK_IMAGE_DETAIL: z.enum(["low", "original"]).default("low"),
  RETRY_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() !== "false")
});

export interface AppConfig {
  host: string;
  port: number;
  frontendOrigin: string;
  dataRoot: string;
  selfiesRoot?: string;
  maxStillBytes: number;
  maxMotionBytes: number;
  retryEnabled: boolean;
  deepSeek: {
    apiKey?: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
    maxRetries: number;
    imageDetail: "low" | "original";
  };
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  loadDotEnv({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
  const parsed = environmentSchema.parse(environment);
  return {
    host: parsed.BACKEND_HOST,
    port: parsed.BACKEND_PORT,
    frontendOrigin: parsed.FRONTEND_ORIGIN,
    dataRoot: parsed.DATA_ROOT ?? path.resolve(process.cwd(), "data"),
    ...(parsed.SELFIES_DIR ? { selfiesRoot: path.resolve(process.cwd(), parsed.SELFIES_DIR) } : {}),
    maxStillBytes: parsed.MAX_STILL_BYTES,
    maxMotionBytes: parsed.MAX_MOTION_BYTES,
    retryEnabled: parsed.RETRY_ENABLED,
    deepSeek: {
      apiKey: parsed.DEEPSEEK_API_KEY,
      baseUrl: parsed.DEEPSEEK_BASE_URL,
      model: parsed.DEEPSEEK_MODEL,
      timeoutMs: parsed.MODEL_GATEWAY_TIMEOUT_MS,
      maxRetries: parsed.MODEL_GATEWAY_MAX_RETRIES,
      imageDetail: parsed.DEEPSEEK_IMAGE_DETAIL
    }
  };
}
