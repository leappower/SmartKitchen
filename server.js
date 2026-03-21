const express = require('express');
const compression = require('compression');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { feishuProTables } = require('./scripts/generate-products-data-table.js');
const {
  runFeishuSyncOnce,
  startDailyFeishuSyncScheduler,
  buildFeishuConfigFromEnv,
  validateFeishuConfig
} = feishuProTables;

const app = express();

// Security middleware with comprehensive protection
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com', 'https://cdn.tailwindcss.com'],
      fontSrc: ['\'self\'', 'https://fonts.gstatic.com'],
      scriptSrc: ['\'self\'', 'https://cdn.tailwindcss.com'],
      imgSrc: ['\'self\'', 'data:', 'https:', 'http:'],
      connectSrc: ['\'self\''],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Enable gzip/brotli compression with optimized settings
app.use(compression({
  level: 6, // Good balance between compression and speed
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Don't compress already compressed assets
    if (req.path.match(/\.(gz|br|zip|rar|7z)$/)) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Additional security and performance headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // Remove server header for security
  res.removeHeader('X-Powered-By');

  next();
});

// Advanced caching middleware with content-based cache keys
app.use((req, res, next) => {
  const isAsset = req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|json)$/);
  const isTranslation = req.path.includes('/translations/');

  if (req.path === '/' || req.path === '/index.html') {
    // Main HTML - short cache to allow updates
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate'); // 5 minutes
    res.setHeader('Vary', 'Accept-Encoding');
  } else if (isTranslation) {
    // Translation files - medium cache with stale-while-revalidate
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400'); // 1 hour + 1 day stale
  } else if (isAsset) {
    // Static assets - long-term cache with immutable
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    res.setHeader('Cache-Control', `public, max-age=${maxAge}, immutable`);
    res.setHeader('Expires', new Date(Date.now() + maxAge * 1000).toUTCString());
  } else {
    // Other routes - short cache
    res.setHeader('Cache-Control', 'public, max-age=1800'); // 30 minutes
  }

  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve static files with advanced optimizations
app.use(express.static(path.join(__dirname, 'dist'), {
  etag: true,
  lastModified: true,
  maxAge: 0, // Let Cache-Control header handle caching
  immutable: true, // Assets are immutable
  setHeaders: (res, path) => {
    const ext = path.split('.').pop().toLowerCase();

    // Set specific cache headers based on file type
    if (['css', 'js'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
    } else if (['png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'woff', 'woff2'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
    } else if (ext === 'json') {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400'); // 1 hour + 1 day stale
    }

    // Removed incorrect preload hint for translations
  }
}));

// SPA fallback with proper 404 handling
app.get('*', (req, res) => {
  // Only look inside dist/ — never expose project root files (scripts/, .env, etc.)
  const filePath = path.join(__dirname, 'dist', req.path);

  // Check if file exists
  if (require('fs').existsSync(filePath) && require('fs').statSync(filePath).isFile()) {
    res.sendFile(filePath);
  } else {
    // For SPA routes, serve index.html
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal Server Error',
    ...(isDevelopment && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

const PORT = process.env.PORT || 3000;

// Start server with error handling
const server = app.listen(PORT, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }

  console.log(`🚀 Optimized static server running on http://localhost:${PORT}`);
  console.log('📦 Compression: Enabled');
  console.log('🔒 Security headers: Enhanced');
  console.log('💾 Advanced caching: Enabled');
  console.log('🛡️  Rate limiting: Enabled');
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);

  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Development mode: Error details enabled');
  }

  const feishuConfig = buildFeishuConfigFromEnv();
  if (validateFeishuConfig(feishuConfig)) {
    runFeishuSyncOnce()
      .then((result) => {
        console.log('[feishu-sync] initial sync finished:', JSON.stringify(result));
      })
      .catch((err) => {
        console.error('[feishu-sync] initial sync failed:', err.message);
      });
  } else {
    console.log('[feishu-sync] initial sync skipped: missing FEISHU env config');
  }

  startDailyFeishuSyncScheduler();
  console.log('[feishu-sync] daily scheduler enabled (04:00)');
});

// Graceful shutdown with connection draining
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}, shutting down gracefully`);

  server.close((err) => {
    if (err) {
      console.error('Error during server shutdown:', err);
      process.exit(1);
    }

    console.log('Server closed successfully');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
