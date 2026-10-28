import { ref } from "vue";
import {
  uploadAppleLivePhotoPair,
  uploadLiveAsset
} from "@/entities/live-asset/api/live-asset.api";
import type {
  LiveAsset,
  UploadAppleLivePhotoPairInput,
  UploadLiveAssetInput
} from "@/entities/live-asset/model/live-asset.types";

export type UploadState = "idle" | "uploading" | "success" | "error";

export function useLiveAssetUpload() {
  const state = ref<UploadState>("idle");
  const progress = ref(0);
  const errorMessage = ref("");

  async function upload(input: UploadLiveAssetInput): Promise<LiveAsset | null> {
    return runUpload(() => uploadLiveAsset(input, (value) => { progress.value = value; }));
  }

  async function uploadPair(input: UploadAppleLivePhotoPairInput): Promise<LiveAsset | null> {
    return runUpload(() => uploadAppleLivePhotoPair(input, (value) => { progress.value = value; }));
  }

  async function runUpload(operation: () => Promise<LiveAsset>): Promise<LiveAsset | null> {
    state.value = "uploading";
    progress.value = 0;
    errorMessage.value = "";
    try {
      const asset = await operation();
      state.value = "success";
      progress.value = 100;
      return asset;
    } catch (error) {
      state.value = "error";
      errorMessage.value = error instanceof Error ? error.message : "上传失败。";
      return null;
    }
  }

  function clearError(): void {
    if (state.value === "error") state.value = "idle";
    errorMessage.value = "";
  }

  return { state, progress, errorMessage, upload, uploadPair, clearError };
}
