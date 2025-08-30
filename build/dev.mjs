import { defineConfig } from '@rspack/cli';
import { rspack } from '@rspack/core';
import ReactRefreshPlugin from '@rspack/plugin-react-refresh';
import { merge } from 'webpack-merge';
import base from './base.mjs';
import { getCSSModuleRules, getDemosEntries, resolve } from './helper.mjs';

const { CopyRspackPlugin } = rspack;

const { entries, htmlPlugins } = getDemosEntries();

const dev = defineConfig({
  mode: 'development',
  devtool: 'source-map',
  devServer: {
    client: {
      logging: 'info',
      overlay: true,
      progress: true,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    historyApiFallback: {
      disableDotRule: true,
    },
    host: 'local-ip',
    hot: true,
    // open: true,
    port: 2333,
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer) {
        throw new Error('webpack-dev-server is not defined');
      }

      // 在这里拦截对 /favicon.ico 的请求
      devServer.app.get('/favicon.ico', (req, res) => {
        res.status(204).send(); // 发送 204 No Content 响应
      });

      return middlewares;
    },
  },
  entry: {
    ...entries,
  },
  module: {
    rules: getCSSModuleRules(),
  },
  plugins: [
    ...htmlPlugins,
    new ReactRefreshPlugin(),
    new CopyRspackPlugin({
      patterns: [
        {
          from: resolve('demos/public'),
          to: resolve('dist/static'),
        },
      ],
    }),
  ],
  optimization: {
    moduleIds: 'named',
    chunkIds: 'named',
    minimize: false,
  },
  experiments: {
    css: true,
  },
});

export default merge(base, dev);
