# macOS 相册导入与远程演示双模式实施计划

## 阶段 1：统一后端资产模型

1. 增加 Apple pair 上传用例与 multipart 接口。
2. 复用现有资源仓库、ffprobe 与 FFmpeg 预览生成器。
3. 保留 embedded Motion Photo 入口，统一输出 `LiveAssetDto`。
4. 增加 Apple pair 校验与路由测试。

## 阶段 2：内置演示资产

1. 定义演示资产 manifest。
2. 添加可公开展示的短视频、封面与元数据。
3. 后端启动时幂等注册演示资产。
4. 增加 `GET /api/v1/demo-assets` 与测试。

## 阶段 3：前端双模式

1. 增加 `creator/demo` 运行时配置。
2. Creator 模式增加 Mac 相册选择模块和 Helper 状态反馈。
3. Demo 模式增加内置案例入口并隐藏上传。
4. 两种来源统一向工作台提交 `LiveAsset`。

## 阶段 4：macOS PhotoKit Helper

1. 建立 Swift Package 和 `.app` 打包脚本。
2. 实现 loopback HTTP bridge、并发限制和 CORS。
3. 实现照片授权、Live Photo 选择、photo/pairedVideo 导出。
4. 实现向 Node Apple pair 接口上传和结果回传。

## 阶段 5：集成验证

1. TypeScript 类型检查、单元测试和生产构建。
2. Swift 编译测试和 Helper 健康检查。
3. Creator 模式：Helper 检测、选择取消、后端导入流程。
4. Demo 模式：无 Helper 情况下加载内置样例并预览。
5. 保持本地服务可运行，并记录签名/权限等非本期限制。
