import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";

export type PhotoLibraryPermission = "authorized" | "limited" | "denied" | "notDetermined";

export interface PhotoHelperHealth {
  status: "ok";
  version: string;
  permission: PhotoLibraryPermission;
}

export interface DemoAsset {
  slug: string;
  title: string;
  description: string;
  asset: LiveAsset;
}
