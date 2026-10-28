import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { ImportLiveAsset } from "../../application/import-live-asset.js";
import type { ImportAppleLivePhoto } from "../../application/import-apple-live-photo.js";
import type { GetLiveAsset } from "../../application/get-live-asset.js";
import type { LiveAssetRepository } from "../../application/live-asset.ports.js";
import type { IncomingUploadFile } from "../../domain/live-asset.types.js";
import type { DemoAssetEntry } from "../../infrastructure/demo-asset-seeder.js";
import type { LocalPhotoLibrary } from "../../infrastructure/local-photo-library.js";
import { liveAssetIdSchema } from "./live-asset.schemas.js";

export interface LiveAssetRoutesDependencies {
  importLiveAsset: ImportLiveAsset;
  importAppleLivePhoto: ImportAppleLivePhoto;
  getLiveAsset: GetLiveAsset;
  repository: LiveAssetRepository;
  incomingDirectory: string;
  maxUploadBytes: number;
  demoAssets: readonly DemoAssetEntry[];
  photoLibrary: LocalPhotoLibrary;
}

interface SingleFileUpload {
  livePhoto?: IncomingUploadFile;
  temporaryPaths: string[];
}

interface ApplePairUpload {
  still?: IncomingUploadFile;
  motion?: IncomingUploadFile;
  assetIdentifier?: string;
  temporaryPaths: string[];
}

export async function registerLiveAssetRoutes(
  app: FastifyInstance,
  dependencies: LiveAssetRoutesDependencies
): Promise<void> {
  await mkdir(dependencies.incomingDirectory, { recursive: true });

  app.post("/api/v1/live-assets", async (request, reply) => {
    const upload: SingleFileUpload = {
      temporaryPaths: []
    };
    try {
      const parts = request.parts({
        limits: { files: 1, fields: 0, fileSize: dependencies.maxUploadBytes }
      });
      for await (const part of parts) {
        if (part.type === "field") continue;

        if (part.fieldname !== "livePhoto") {
          part.file.resume();
          continue;
        }
        if (upload.livePhoto) {
          part.file.resume();
          throw new AppError("DUPLICATE_SOURCE_FILE", "同一种资源只能上传一个文件。", 400);
        }

        const temporaryPath = path.join(dependencies.incomingDirectory, randomUUID());
        upload.temporaryPaths.push(temporaryPath);
        await pipeline(part.file, createWriteStream(temporaryPath, { flags: "wx" }));
        if (part.file.truncated) {
          throw new AppError("FILE_TOO_LARGE", "上传文件超过允许大小。", 413);
        }
        const fileStat = await stat(temporaryPath);
        upload.livePhoto = {
          temporaryPath,
          originalName: part.filename,
          mimeType: part.mimetype,
          byteLength: fileStat.size
        };
      }

      if (!upload.livePhoto) {
        throw new AppError(
          "LIVE_PHOTO_REQUIRED",
          "必须上传一个包含动态轨的照片文件。",
          400
        );
      }
      const asset = await dependencies.importLiveAsset.execute({
        livePhoto: upload.livePhoto
      });
      return reply.code(201).send(asset);
    } finally {
      await Promise.all(upload.temporaryPaths.map((filePath) => rm(filePath, { force: true })));
    }
  });

  app.post("/api/v1/live-assets/apple-pair", async (request, reply) => {
    const upload: ApplePairUpload = { temporaryPaths: [] };
    try {
      const parts = request.parts({
        limits: { files: 2, fields: 1, fileSize: dependencies.maxUploadBytes }
      });
      for await (const part of parts) {
        if (part.type === "field") {
          if (part.fieldname === "assetIdentifier" && typeof part.value === "string") {
            upload.assetIdentifier = part.value.slice(0, 256);
          }
          continue;
        }
        if (part.fieldname !== "still" && part.fieldname !== "motion") {
          part.file.resume();
          continue;
        }
        if (upload[part.fieldname]) {
          part.file.resume();
          throw new AppError("DUPLICATE_SOURCE_FILE", "同一种资源只能上传一个文件。", 400);
        }
        const temporaryPath = path.join(dependencies.incomingDirectory, randomUUID());
        upload.temporaryPaths.push(temporaryPath);
        await pipeline(part.file, createWriteStream(temporaryPath, { flags: "wx" }));
        if (part.file.truncated) {
          throw new AppError("FILE_TOO_LARGE", "上传文件超过允许大小。", 413);
        }
        const fileStat = await stat(temporaryPath);
        upload[part.fieldname] = {
          temporaryPath,
          originalName: part.filename,
          mimeType: part.mimetype,
          byteLength: fileStat.size
        };
      }
      if (!upload.still || !upload.motion) {
        throw new AppError("APPLE_PAIR_REQUIRED", "Apple 实况资产必须同时包含照片与视频资源。", 400);
      }
      const asset = await dependencies.importAppleLivePhoto.execute({
        still: upload.still,
        motion: upload.motion,
        ...(upload.assetIdentifier ? { assetIdentifier: upload.assetIdentifier } : {})
      });
      return reply.code(201).send(asset);
    } finally {
      await Promise.all(upload.temporaryPaths.map((filePath) => rm(filePath, { force: true })));
    }
  });

  app.get("/api/v1/demo-assets", async () => dependencies.demoAssets);

  app.get<{ Querystring: { refresh?: string } }>(
    "/api/v1/photo-library",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return dependencies.photoLibrary.list({ refresh: request.query.refresh === "1" });
    }
  );

  app.get<{ Params: { id: string } }>("/api/v1/live-assets/:id", async (request) => {
    const id = liveAssetIdSchema.parse(request.params.id);
    return dependencies.getLiveAsset.execute(id);
  });

  app.get<{ Params: { id: string; filename: string } }>(
    "/media/:id/preview/:filename",
    async (request, reply) => {
      const id = liveAssetIdSchema.parse(request.params.id);
      const filename = request.params.filename;
      if (filename !== "poster.jpg" && filename !== "thumb.jpg" && filename !== "motion.mp4") {
        throw new AppError("MEDIA_NOT_FOUND", "预览资源不存在。", 404);
      }
      const filePath = await dependencies.repository.resolvePreview(id, filename);
      if (!filePath) {
        throw new AppError("MEDIA_NOT_FOUND", "预览资源不存在。", 404);
      }
      const mediaType = filename.endsWith(".jpg") ? "image/jpeg" : "video/mp4";
      const fileStat = await stat(filePath);
      reply.header("Accept-Ranges", "bytes");
      reply.header("Cache-Control", "private, max-age=3600");
      reply.type(mediaType);

      const range = request.headers.range;
      if (range && filename.endsWith(".mp4")) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (match?.[1]) {
          const start = Number.parseInt(match[1], 10);
          const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : fileStat.size - 1;
          const end = Math.min(requestedEnd, fileStat.size - 1);
          if (start <= end && start < fileStat.size) {
            reply.code(206);
            reply.header("Content-Range", `bytes ${start}-${end}/${fileStat.size}`);
            reply.header("Content-Length", end - start + 1);
            return reply.send(createReadStream(filePath, { start, end }));
          }
        }
        reply.code(416).header("Content-Range", `bytes */${fileStat.size}`);
        return reply.send();
      }

      reply.header("Content-Length", fileStat.size);
      return reply.send(createReadStream(filePath));
    }
  );
}
