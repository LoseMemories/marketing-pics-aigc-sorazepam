const path = require("node:path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { VueLoaderPlugin } = require("vue-loader");
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);

// 可切换的后端目标：默认本地，可在页面右上角实时切换（不走重启）
const backendOptions = {
  local: process.env.LOCAL_BACKEND_TARGET || "http://127.0.0.1:3000",
  remote: process.env.REMOTE_BACKEND_TARGET || "http://39.106.168.207:3000"
};
// 兼容旧用法：API_PROXY_TARGET 显式指定时视为远程目标并直接选中
if (process.env.API_PROXY_TARGET) {
  backendOptions.remote = process.env.API_PROXY_TARGET;
}
let activeBackend = process.env.DEFAULT_BACKEND === "remote" || process.env.API_PROXY_TARGET ? "remote" : "local";

module.exports = (_env, argv) => ({
  mode: argv.mode || "development",
  entry: path.resolve(__dirname, "src/app/main.ts"),
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "assets/[name].[contenthash].js",
    clean: true,
    publicPath: "/"
  },
  resolve: {
    extensions: [".ts", ".js", ".vue", ".json"],
    alias: {
      "@": path.resolve(__dirname, "src"),
      vue$: "vue/dist/vue.esm-bundler.js"
    }
  },
  // 从仓库根目录启动时，loader 也要能从 frontend/node_modules 找到
  resolveLoader: {
    modules: [path.resolve(__dirname, "node_modules"), "node_modules"]
  },
  module: {
    rules: [
      { test: /\.vue$/, loader: "vue-loader" },
      {
        test: /\.ts$/,
        loader: "ts-loader",
        options: { appendTsSuffixTo: [/\.vue$/], transpileOnly: true },
        exclude: /node_modules/
      },
      { test: /\.css$/, use: ["style-loader", "css-loader"] }
    ]
  },
  plugins: [
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({ template: path.resolve(__dirname, "index.html") }),
    new webpack.DefinePlugin({
      __APP_MODE__: JSON.stringify(process.env.APP_MODE || "creator"),
      __PHOTO_HELPER_URL__: JSON.stringify(
        process.env.PHOTO_HELPER_URL || "http://127.0.0.1:48171"
      )
    })
  ],
  devtool: argv.mode === "production" ? "source-map" : "eval-cheap-module-source-map",
  watchOptions: {
    ignored: /node_modules/,
    poll: 1000
  },
  devServer: {
    host: "127.0.0.1",
    port: frontendPort,
    hot: true,
    historyApiFallback: true,
    static: {
      directory: path.resolve(__dirname, "public")
    },
    client: {
      overlay: {
        // ResizeObserver loop 是浏览器良性告警，不阻断开发
        runtimeErrors: (err) => !/ResizeObserver loop/i.test(String(err?.message ?? err))
      }
    },
    // /__backend：切换代理目标（仅开发环境，生产构建里不存在）
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer?.app) return middlewares;
      devServer.app.get("/__backend", (_request, response) => {
        response.json({ active: activeBackend, options: backendOptions });
      });
      devServer.app.post("/__backend", (request, response) => {
        const name = String(request.query.name ?? "");
        if (!Object.prototype.hasOwnProperty.call(backendOptions, name)) {
          response.status(400).json({ error: `unknown backend: ${name}` });
          return;
        }
        activeBackend = name;
        response.json({ active: activeBackend, url: backendOptions[activeBackend] });
      });
      return middlewares;
    },
    proxy: [
      {
        context: ["/api", "/media", "/health", "/gallery"],
        target: backendOptions[activeBackend],
        // router 每次请求时求值，因此切换后无需重启 dev-server
        router: () => backendOptions[activeBackend],
        changeOrigin: true
      }
    ]
  }
});
