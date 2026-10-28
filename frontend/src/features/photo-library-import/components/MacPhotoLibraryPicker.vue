<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { AppleOutlined, LoadingOutlined, ReloadOutlined } from "@ant-design/icons-vue";
import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";
import { ApiClientError } from "@/shared/api/http-client";
import { getPhotoHelperHealth, pickAppleLivePhoto } from "../api/photo-helper.api";
import type { PhotoHelperHealth } from "../model/import-source.types";

const emit = defineEmits<{ imported: [asset: LiveAsset] }>();
const health = ref<PhotoHelperHealth>();
const checking = ref(false);
const importing = ref(false);
const errorMessage = ref("");

const statusLabel = computed(() => {
  if (checking.value) return "正在检测本机助手";
  if (!health.value) return "本机助手未连接";
  if (health.value.permission === "denied") return "相册权限已拒绝";
  return "本机助手已连接";
});

async function checkHelper(): Promise<void> {
  checking.value = true;
  errorMessage.value = "";
  try {
    health.value = await getPhotoHelperHealth();
  } catch (error) {
    health.value = undefined;
    errorMessage.value = error instanceof Error ? error.message : "无法检测本机相册助手。";
  } finally {
    checking.value = false;
  }
}

async function chooseFromPhotos(): Promise<void> {
  importing.value = true;
  errorMessage.value = "";
  try {
    const asset = await pickAppleLivePhoto();
    emit("imported", asset);
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "PICK_CANCELLED") {
      errorMessage.value = "已取消选择。";
    } else {
      errorMessage.value = error instanceof Error ? error.message : "实况照片导入失败。";
    }
  } finally {
    importing.value = false;
  }
}

onMounted(checkHelper);
</script>

<template>
  <section class="source-panel" aria-labelledby="photo-library-title">
    <div class="section-heading">
      <span class="eyebrow">01 · SOURCE</span>
      <h2 id="photo-library-title">从 Mac 相册选择</h2>
      <p>像手机应用一样只选择一次。PhotoKit 会读取同一条实况资产里的原始照片与配对视频，网页无需你手动上传两个文件。</p>
    </div>

    <button class="library-picker" type="button" :disabled="importing" @click="chooseFromPhotos">
      <LoadingOutlined v-if="importing" class="picker-icon" spin />
      <AppleOutlined v-else class="picker-icon" />
      <span class="picker-label">MACOS PHOTOKIT</span>
      <strong>{{ importing ? '正在等待相册选择并导入…' : '打开系统相册' }}</strong>
      <small>仅显示实况照片；原始运动与声音会完整保留</small>
    </button>

    <div class="helper-status" :class="{ ready: health }">
      <i />
      <span>{{ statusLabel }}</span>
      <button type="button" :disabled="checking" @click="checkHelper"><ReloadOutlined /> 重新检测</button>
    </div>

    <a-alert v-if="errorMessage" :message="errorMessage" type="warning" show-icon />
  </section>
</template>

<style scoped>
.source-panel { display: flex; flex-direction: column; gap: 22px; }
.section-heading h2 { margin: 8px 0; color: #f4f6f8; font-size: clamp(24px, 3vw, 38px); letter-spacing: -0.04em; }
.section-heading p { max-width: 620px; margin: 0; color: #9299a3; line-height: 1.7; }
.eyebrow { color: #d9ff52; font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.16em; }
.library-picker { width: 100%; min-height: 224px; padding: 28px; border: 1px solid #3a414b; border-radius: 18px; color: #f4f6f8; text-align: left; background: radial-gradient(circle at 85% 15%, rgb(217 255 82 / 12%), transparent 36%), linear-gradient(145deg, #171a1f, #111317); cursor: pointer; transition: 160ms ease; }
.library-picker:hover:not(:disabled), .library-picker:focus-visible { border-color: #d9ff52; transform: translateY(-2px); outline: none; }
.library-picker:disabled { cursor: wait; opacity: .75; }
.picker-icon { display: block; margin-bottom: 46px; color: #d9ff52; font-size: 31px; }
.picker-label, .library-picker strong, .library-picker small { display: block; }
.picker-label { margin-bottom: 7px; color: #747c87; font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; }
.library-picker strong { font-size: 18px; }
.library-picker small { margin-top: 8px; color: #747c87; }
.helper-status { display: flex; align-items: center; gap: 9px; color: #8b929c; font-size: 12px; }
.helper-status i { width: 7px; height: 7px; border-radius: 50%; background: #f0a044; box-shadow: 0 0 14px rgb(240 160 68 / 45%); }
.helper-status.ready i { background: #d9ff52; box-shadow: 0 0 14px rgb(217 255 82 / 45%); }
.helper-status button { margin-left: auto; border: 0; color: #8b929c; background: none; cursor: pointer; }
</style>
