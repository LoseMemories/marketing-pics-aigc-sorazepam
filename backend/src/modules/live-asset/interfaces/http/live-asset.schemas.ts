import { z } from "zod";
import { platformHints } from "../../domain/live-asset.types.js";

export const liveAssetIdSchema = z.string().uuid();
export const platformHintSchema = z.enum(platformHints).default("unknown");
