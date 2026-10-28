import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { GetLiveAsset } from "../modules/live-asset/application/get-live-asset.js";
import { ImportLiveAsset } from "../modules/live-asset/application/import-live-asset.js";
import { ImportAppleLivePhoto } from "../modules/live-asset/application/import-apple-live-photo.js";
import { FfprobeMediaProbe } from "../modules/live-asset/infrastructure/ffprobe-media-probe.js";
import { EmbeddedMotionPhotoExtractor } from "../modules/live-asset/infrastructure/embedded-motion-photo-extractor.js";
import { FfmpegPreviewTranscoder } from "../modules/live-asset/infrastructure/ffmpeg-preview-transcoder.js";
import { LocalAssetRepository } from "../modules/live-asset/infrastructure/local-asset-repository.js";
import { DemoAssetSeeder } from "../modules/live-asset/infrastructure/demo-asset-seeder.js";
import { LocalPhotoLibrary } from "../modules/live-asset/infrastructure/local-photo-library.js";
import { registerLiveAssetRoutes } from "../modules/live-asset/interfaces/http/live-asset.routes.js";
import { AppError, type ErrorResponse } from "../shared/errors/app-error.js";
import { MediaToolchain } from "../shared/media/toolchain.js";
import type { AppConfig } from "./config.js";
import { AnalyzeScene } from "../modules/design-assistant/application/analyze-scene.js";
import { ComposeCanvasCase } from "../modules/design-assistant/application/compose-canvas.js";
import { DesignLayout } from "../modules/design-assistant/application/design-layout.js";
import { GenerateComposition } from "../modules/design-assistant/application/generate-composition.js";
import { PlanLayout } from "../modules/design-assistant/application/plan-layout.js";
import { DeepSeekDesignAssistant } from "../modules/design-assistant/infrastructure/deepseek-design-assistant.js";
import { LocalDesignAssetStore } from "../modules/design-assistant/infrastructure/local-design-asset-store.js";
import { registerDesignAssistantRoutes } from "../modules/design-assistant/interfaces/http/design-assistant.routes.js";
import { registerGalleryRoutes } from "../modules/gallery/gallery.routes.js";
import { registerWorkflowRoutes } from "../modules/workflow/workflow.routes.js";

export async function buildServer(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const toolchain = new MediaToolchain();
  const repository = new LocalAssetRepository(config.dataRoot);
  await repository.ensureReady();
  const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(runtimeDirectory, "../../..");
  const demoRoot = path.resolve(runtimeDirectory, "../../demo-assets");
  const workflowScript =
    process.env.WORKFLOW_ANALYZE_SCRIPT ??
    path.resolve(projectRoot, "resources/deepseek/crawl/workflow-analyze.py");
  const demoAssets = await new DemoAssetSeeder(
    config.dataRoot,
    demoRoot
  ).seed(["aurora"]);

  const mediaProbe = new FfprobeMediaProbe(toolchain.ffprobePath);
  const transcoder = new FfmpegPreviewTranscoder(
    toolchain.ffmpegPath,
    toolchain.sipsPath,
    toolchain.heifConvertPath
  );
  const importLiveAsset = new ImportLiveAsset(repository, new EmbeddedMotionPhotoExtractor(mediaProbe), transcoder, {
    maxMotionBytes: config.maxMotionBytes
  });
  const importAppleLivePhoto = new ImportAppleLivePhoto(repository, mediaProbe, transcoder, {
    maxStillBytes: config.maxStillBytes,
    maxMotionBytes: config.maxMotionBytes
  });

  const photoLibrary = new LocalPhotoLibrary({
    selfiesRoot: config.selfiesRoot ?? path.resolve(runtimeDirectory, "../../selfies"),
    repository,
    mediaProbe,
    transcoder,
    sipsPath: toolchain.sipsPath
  });

  await app.register(cors, {
    origin: [config.frontendOrigin, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/],
    methods: ["GET", "POST"]
  });
  await app.register(multipart);

  app.get("/health", async () => ({
    status: "ok",
    apiVersion: "photo-library-demo-v1",
    deepSeekConfigured: Boolean(config.deepSeek.apiKey),
    tools: await toolchain.availability()
  }));

  await registerLiveAssetRoutes(app, {
    importLiveAsset,
    importAppleLivePhoto,
    getLiveAsset: new GetLiveAsset(repository),
    repository,
    incomingDirectory: path.join(config.dataRoot, "incoming"),
    maxUploadBytes: Math.max(config.maxStillBytes, config.maxMotionBytes),
    demoAssets,
    photoLibrary
  });
  const selfiesRoot = config.selfiesRoot ?? path.resolve(runtimeDirectory, "../../selfies");
  const designStore = new LocalDesignAssetStore(config.dataRoot, selfiesRoot);
  const designGateway = new DeepSeekDesignAssistant(config.deepSeek);
  await registerDesignAssistantRoutes(app, {
    analyzeScene: new AnalyzeScene(designStore, designGateway),
    generateComposition: new GenerateComposition(designStore, designGateway),
    planLayout: new PlanLayout(designStore),
    designLayout: new DesignLayout(designStore, designGateway),
    composeCanvas: new ComposeCanvasCase(designStore),
    readCopySource: (id: string) => designStore.readCopySource(id)
  });

  await registerGalleryRoutes(app, {
    root: path.join(config.dataRoot, "inspiration"),
    retryEnabled: config.retryEnabled
  });
  const modelsRoot = process.env.WORKFLOW_MODELS_DIR ?? path.resolve(projectRoot, "models");
  await registerWorkflowRoutes(app, {
    uploadDir: path.join(config.dataRoot, "inspiration", "uploads"),
    galleryRoot: path.join(config.dataRoot, "inspiration"),
    scriptPath: workflowScript,
    python: process.env.WORKFLOW_PYTHON ?? "/usr/bin/python3",
    pythonPath: process.env.WORKFLOW_PYTHONPATH ?? path.join(modelsRoot, "pylibs39")
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      const body: ErrorResponse = {
        error: { code: error.code, message: error.message, details: error.details }
      };
      return reply.code(error.statusCode).send(body);
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: { code: "INVALID_REQUEST", message: "请求参数格式不正确。" }
      });
    }
    const transportError = error as { statusCode?: number; code?: string };
    if (
      transportError.statusCode === 413 ||
      transportError.code === "FST_REQ_FILE_TOO_LARGE"
    ) {
      return reply.code(413).send({
        error: { code: "FILE_TOO_LARGE", message: "上传文件超过允许大小。" }
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL_SERVER_ERROR", message: "服务器处理请求时发生错误。" }
    });
  });

  return app;
}
