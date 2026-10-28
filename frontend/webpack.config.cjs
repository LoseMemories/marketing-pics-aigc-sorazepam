const path = require("node:path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { VueLoaderPlugin } = require("vue-loader");
const frontendPort = Number(process.env.FRONTEND_PORT || 5173);
const apiProxyTarget = process.env.API_PROXY_TARGET || "http://127.0.0.1:3000";

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
    proxy: [
      {
        context: ["/api", "/media", "/health", "/gallery"],
        target: apiProxyTarget,
        changeOrigin: true
      }
    ]
  }
});
