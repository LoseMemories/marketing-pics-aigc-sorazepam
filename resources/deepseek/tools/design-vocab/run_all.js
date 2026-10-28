const from = args.from || 0;
const to = args.to;            // inclusive
const conc = args.conc || 10;
const ids = [];
for (let i = from; i <= to; i++) ids.push('b' + String(i).padStart(3, '0'));
phase('视觉分析');
const out = [];
for (let i = 0; i < ids.length; i += conc) {
  const part = ids.slice(i, i + conc);
  const res = await Promise.all(part.map((id) =>
    agent(
      `工作目录 /Users/sunsizhe/Documents/deepseek-harness/handoff。\n` +
      `请阅读 tools/design-vocab/AGENT_TASK.md，并读取 crawl-raw/_analysis_batches.json 中 id=${id} 的批次，` +
      `严格按该说明与 docs/10-设计语汇分析提示词.md 完成任务。只处理该批次的图片，完成后只回复一行 DONE。`,
      { label: id, phase: '视觉分析' }
    ).then((r) => ({ id, report: r })).catch((e) => ({ id, report: null, error: String(e) }))
  ));
  out.push(...res);
  log(`完成 ${Math.min(i + conc, ids.length)}/${ids.length}`);
}
return out;
