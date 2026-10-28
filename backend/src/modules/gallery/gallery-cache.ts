/**
 * 图库扫描缓存版本号。
 *
 * 上传/分析完成后图库内容会变化，但扫描结果默认缓存 30s，
 * 若不失效，前端拿到的是旧目录（新批次看不到）。
 * 这里用进程内版本号做轻量失效：写侧 +1，读侧发现版本不一致就重扫。
 */
let catalogVersion = 0;

export function invalidateGalleryCatalog(): void {
  catalogVersion += 1;
}

export function currentCatalogVersion(): number {
  return catalogVersion;
}
