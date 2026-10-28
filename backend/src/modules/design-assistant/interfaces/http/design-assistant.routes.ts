import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AnalyzeScene } from "../../application/analyze-scene.js";
import type { ComposeCanvasCase } from "../../application/compose-canvas.js";
import type { DesignLayout } from "../../application/design-layout.js";
import type { GenerateComposition } from "../../application/generate-composition.js";
import type { PlanLayout } from "../../application/plan-layout.js";

const idSchema = z.string().uuid();
const compositionBodySchema = z.object({
  brief: z.string().min(1).max(500),
  focusSubjects: z.array(z.string().trim().min(1).max(120)).max(12).optional()
});

const layoutPlanBodySchema = z.object({
  focusSubjects: z.array(z.string().trim().min(1).max(120)).max(12).optional()
});

const designLayoutBodySchema = z.object({
  brief: z.string().max(500).optional(),
  focusSubjects: z.array(z.string().trim().min(1).max(120)).max(12).optional()
});

const composeBodySchema = z.object({
  design: z.unknown(),
  focusSubjects: z.array(z.string().trim().min(1).max(120)).max(12).optional()
});

export async function registerDesignAssistantRoutes(
  app: FastifyInstance,
  dependencies: {
    analyzeScene: AnalyzeScene;
    generateComposition: GenerateComposition;
    planLayout: PlanLayout;
    designLayout: DesignLayout;
    composeCanvas: ComposeCanvasCase;
    readCopySource(id: string): Promise<string>;
  }
): Promise<void> {
  app.post<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    "/api/v1/live-assets/:id/scene-analysis",
    async (request) =>
      dependencies.analyzeScene.execute(idSchema.parse(request.params.id), {
        refresh: request.query.refresh === "1"
      })
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/v1/live-assets/:id/layout-plan",
    async (request) => {
      const id = idSchema.parse(request.params.id);
      const body = layoutPlanBodySchema.parse(request.body ?? {});
      return dependencies.planLayout.execute(id, body.focusSubjects);
    }
  );

  /** L2：调模型出设计语汇（不写坐标/毫秒）。 */
  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/v1/live-assets/:id/design-layout",
    async (request) => {
      const id = idSchema.parse(request.params.id);
      const body = designLayoutBodySchema.parse(request.body ?? {});
      return dependencies.designLayout.execute(id, {
        ...(body.brief !== undefined ? { brief: body.brief } : {}),
        ...(body.focusSubjects ? { focusSubjects: body.focusSubjects } : {})
      });
    }
  );

  /** L3：不调模型，只解算 + 落盘（手动编辑走这里）。 */
  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/v1/live-assets/:id/compose",
    async (request) => {
      const id = idSchema.parse(request.params.id);
      const body = composeBodySchema.parse(request.body ?? {});
      return dependencies.composeCanvas.execute(id, body.design, body.focusSubjects);
    }
  );

  /** 读回已保存的 L2 结果（design.json）。 */
  app.get<{ Params: { id: string } }>("/api/v1/live-assets/:id/design", async (request) => {
    const id = idSchema.parse(request.params.id);
    const design = await dependencies.composeCanvas.load(id);
    return { design };
  });

  /** selfies/<key>.md 的文案源，供前端展示与二次编辑。 */
  app.get<{ Params: { id: string } }>("/api/v1/live-assets/:id/copy-source", async (request) => {
    const id = idSchema.parse(request.params.id);
    const text = await dependencies.readCopySource(id);
    return { text, hasCopySource: text.length > 0 };
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/v1/live-assets/:id/composition",
    async (request) => {
      const id = idSchema.parse(request.params.id);
      const body = compositionBodySchema.parse(request.body);
      return dependencies.generateComposition.execute(id, body.brief, body.focusSubjects);
    }
  );
}
