const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');

module.exports = (_, argv = {}) => {
  const isProduction = argv.mode === 'production';

  return {
    mode: isProduction ? 'production' : 'development',
    entry: './src/index.js',
    optimization: isProduction ? {
      // Split the webpack runtime into its own tiny file so the contenthash of
      // the main bundle only changes when application code actually changes.
      runtimeChunk: 'single',
      splitChunks: {
        chunks: 'all',
        // Only split modules larger than 40 KB (e.g. product-data-table.js ~332 KB)
        minSize: 40_000,
        cacheGroups: {
          // product-data-table goes into its own named chunk so the main
          // bundle is not blocked by parsing 332 KB of static product data.
          productData: {
            test: /[\\/]product-data-table\.js$/,
            name: 'product-data',
            chunks: 'all',
            enforce: true,
          },
        },
      },
      minimize: true,
      minimizer: [
        new TerserPlugin(),
        new CssMinimizerPlugin(),
      ],
    } : {},
    output: {
      // Add contenthash so browsers bust cache after each release
      filename: isProduction ? 'bundle.[contenthash:8].js' : 'bundle.js',
      chunkFilename: isProduction ? '[name].[contenthash:8].js' : '[name].js',
      path: path.resolve(__dirname, 'dist'),
      // Explicit root-relative publicPath — prevents 'auto' mis-detection
      // when the page is served from a non-root path (Nginx, Docker, etc.)
      publicPath: '/',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
            'postcss-loader',
          ],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/index.html',
        ...(isProduction ? {
          minify: {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            useShortDoctype: true,
          },
        } : {}),
      }),
      ...(isProduction
        ? [
          new MiniCssExtractPlugin({
            filename: 'styles.[contenthash:8].css',
          }),
          // Copy language files for static deployment (only split files: *-ui.json and *-product.json)
          new CopyWebpackPlugin({
            patterns: [
              {
                from: 'src/assets/lang',
                to: 'assets/lang',
                filter: (resourcePath) => {
                  const filename = path.basename(resourcePath);
                  // Only copy split files: *-ui.json, *-product.json, and languages.json
                  return filename.endsWith('-ui.json') ||
                         filename.endsWith('-product.json') ||
                         filename === 'languages.json';
                },
                noErrorOnMissing: true,
              },
              // Copy images — optimize-images.js 直接输出到 src/assets/images（含 WebP + 压缩 PNG）
              {
                from: 'src/assets/images',
                to: 'images',
                noErrorOnMissing: true,
              },
              {
                from: 'src/sw.js',
                to: 'sw.js',
                noErrorOnMissing: true,
              },
              // Copy factory tour video if it exists in project root or src/assets/
              {
                from: 'factory-tour.mp4',
                to: 'factory-tour.mp4',
                noErrorOnMissing: true,
              },
              {
                from: 'src/assets/factory-tour.mp4',
                to: 'factory-tour.mp4',
                noErrorOnMissing: true,
              },
              // Copy video directory
              {
                from: 'src/assets/video',
                to: 'video',
                noErrorOnMissing: true,
              },
            ],
          }),
          // Pre-compress assets with gzip for Nginx gzip_static / CDN
          new CompressionPlugin({
            algorithm: 'gzip',
            test: /\.(js|css|html|json|svg)$/,
            threshold: 1024,
            minRatio: 0.8,
            deleteOriginalAssets: false,
          }),
        ]
        : []),
    ],
    devServer: {
      static: [
        {
          directory: path.join(__dirname, 'dist'),
        },
        // dist/assets/lang takes priority when built; silently skipped if dist doesn't exist yet
        {
          directory: path.join(__dirname, 'dist/assets/lang'),
          publicPath: '/assets/lang',
          serveIndex: false,
          watch: false,
        },
        {
          directory: path.join(__dirname, 'src/assets/lang'),
          publicPath: '/assets/lang',
        },
        // Serve image files from src/assets/images (development) or dist/images (production)
        {
          directory: path.join(__dirname, 'dist/images'),
          publicPath: '/images',
        },
        {
          directory: path.join(__dirname, 'src/assets/images'),
          publicPath: '/images',
        },
        // Serve video files from src/assets/video (development) or dist/video (production)
        {
          directory: path.join(__dirname, 'dist/video'),
          publicPath: '/video',
        },
        {
          directory: path.join(__dirname, 'src/assets/video'),
          publicPath: '/video',
        },
      ],
      compress: true,
      port: 3000,
      historyApiFallback: true,
      headers: {
        'Service-Worker-Allowed': '/',
      },
    },
  };
};
