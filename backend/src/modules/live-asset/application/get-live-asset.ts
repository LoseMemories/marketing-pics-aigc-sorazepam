import { AppError } from "../../../shared/errors/app-error.js";
import { toLiveAssetDto } from "../domain/live-asset.js";
import type { LiveAssetDto } from "../domain/live-asset.types.js";
import type { LiveAssetRepository } from "./live-asset.ports.js";

export class GetLiveAsset {
  constructor(private readonly repository: LiveAssetRepository) {}

  async execute(id: string): Promise<LiveAssetDto> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new AppError("LIVE_ASSET_NOT_FOUND", "未找到对应的实况资源。", 404);
    }
    return toLiveAssetDto(record);
  }
}
