<script setup lang="ts">
import { computed, ref } from "vue";
import { FileImageOutlined, UploadOutlined } from "@ant-design/icons-vue";
import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";
import { useLiveAssetUpload } from "../composables/useLiveAssetUpload";
import { scanLivePhotoFiles, type LivePhotoFilePair } from "../model/live-photo-folder";

const emit = defineEmits<{ uploaded: [asset: LiveAsset] }>();

const fileInput = ref<HTMLInputElement>();
const pairs = ref<LivePhotoFilePair[]>([]);
const selectedKey = ref("");
const scanMessage = ref("");
const { state, progress, errorMessage, uploadPair, clearError } = useLiveAssetUpload();

const selectedPair = computed(() => pairs.value.find((pair) => pair.key === selectedKey.value));
const canSubmit = computed(() => Boolean(selectedPair.value) && state.value !== "uploading");

function selectFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const scan = scanLivePhotoFiles(Array.from(input.files ?? []));
  pairs.value = scan.pairs;
  selectedKey.value = scan.pairs[0]?.key ?? "";
  if (scan.pairs.length === 0) {
    scanMessage.value = "没有找到同名的照片与 MOV。请同时选中一张 HEIC/JPG 和它的同名 MOV。";
  } else {
    const skipped = scan.incompleteCount + scan.ambiguousCount;
    scanMessage.value = `已识别 ${scan.pairs.length} 组实况资源${skipped ? `，另有 ${skipped} 组因缺少配对或重名被忽略` : ""}。`;
  }
  clearError();
  input.value = "";
}

async function submit(): Promise<void> {
  const pair = selectedPair.value;
  if (!pair) return;
  const asset = await uploadPair({
    still: pair.still,
    motion: pair.motion,
    assetIdentifier: `files:${pair.key}`
  });
  if (asset) emit("uploaded", asset);
}
</script>

<template>
  <section class="upload-panel" aria-labelledby="upload-title">
    <div class="section-heading">
      <span class="eyebrow">01 · SOURCE</span>
      <h2 id="upload-title">选择实况照片与视频</h2>
      <p>在同一个文件选择窗口中，同时选中 HEIC/JPG 和同名 MOV；系统会自动配对并作为一条 Apple 实况资源导入。</p>
    </div>

    <button class="file-picker" type="button" @click="fileInput?.click()">
      <FileImageOutlined class="picker-icon" />
      <span class="picker-label">TWO FILES · ONE LIVE PHOTO</span>
      <strong>{{ pairs.length ? `已找到 ${pairs.length} 组实况照片` : '选择 HEIC 与同名 MOV' }}</strong>
      <small>{{ scanMessage || '按住 Command 同时选择同名的 HEIC/JPG + MOV' }}</small>
    </button>
    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept=".jpg,.jpeg,.heic,.heif,.mov,image/jpeg,image/heic,image/heif,video/quicktime"
      multiple
      @change="selectFile"
    />

    <label v-if="pairs.length > 1" class="pair-selector">
      <span>选择要导入的实况资源</span>
      <select v-model="selectedKey">
        <option v-for="pair in pairs" :key="pair.key" :value="pair.key">
          {{ pair.displayName }} · {{ (pair.motion.size / 1024 / 1024).toFixed(1) }} MB MOV
        </option>
      </select>
    </label>

    <div v-else-if="selectedPair" class="pair-summary">
      <span>{{ selectedPair.displayName }}</span>
      <small>{{ selectedPair.still.name }} + {{ selectedPair.motion.name }}</small>
    </div>

    <a-alert
      v-if="errorMessage"
      :message="errorMessage"
      type="error"
      show-icon
      closable
      @close="clearError"
    />

    <a-progress
      v-if="state === 'uploading'"
      :percent="progress"
      :show-info="true"
      stroke-color="#d9ff52"
    />

    <a-button
      type="primary"
      size="large"
      block
      :disabled="!canSubmit"
      :loading="state === 'uploading'"
      @click="submit"
    >
      <template #icon><UploadOutlined /></template>
      {{ state === 'uploading' ? '上传照片与视频轨' : '导入并创建实况预览' }}
    </a-button>
  </section>
</template>

<style scoped>
.upload-panel { display: flex; flex-direction: column; gap: 22px; }
.section-heading h2 { margin: 8px 0; color: #f4f6f8; font-size: clamp(24px, 3vw, 38px); letter-spacing: -0.04em; }
.section-heading p { max-width: 620px; margin: 0; color: #9299a3; line-height: 1.7; }
.eyebrow { color: #d9ff52; font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.16em; }
.file-picker {
  width: 100%; min-height: 224px; padding: 28px; border: 1px dashed #3a414b; border-radius: 18px;
  color: #f4f6f8; text-align: left;
  background: radial-gradient(circle at 85% 15%, rgb(217 255 82 / 9%), transparent 35%), linear-gradient(145deg, #171a1f, #111317);
  cursor: pointer; transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;
}
.file-picker:hover, .file-picker:focus-visible {
  border-color: #d9ff52;
  background: radial-gradient(circle at 85% 15%, rgb(217 255 82 / 14%), transparent 38%), linear-gradient(145deg, #1d211f, #111317);
  transform: translateY(-2px); outline: none;
}
.picker-icon { display: block; margin-bottom: 46px; color: #d9ff52; font-size: 30px; }
.picker-label, .file-picker strong, .file-picker small { display: block; }
.picker-label { margin-bottom: 7px; color: #747c87; font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.12em; }
.file-picker strong { overflow: hidden; font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
.file-picker small { margin-top: 8px; color: #747c87; }
.pair-summary, .pair-selector { display: flex; flex-direction: column; gap: 7px; padding: 14px 16px; border: 1px solid #30363f; border-radius: 12px; background: #121519; }
.pair-summary span, .pair-selector span { color: #e3e7ea; font-weight: 600; }
.pair-summary small { color: #7f8791; }
.pair-selector select { padding: 10px 12px; border: 1px solid #3a414b; border-radius: 8px; color: #e3e7ea; background: #191d22; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }
</style>
