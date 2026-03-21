// 图片路径配置：统一使用 /images 前缀（dev/production 均通过 webpack 映射到 src/assets/images）
const IMAGE_PATH_PREFIX = 'images';

// ─── WebP 图片路径 ────────────────────────────────────────────────────────────
// 所有本地图片均已转换为 WebP（IE 已于 2022 年停止支持，WebP 全球支持率 97%+）
// 产品图列表由 optimize-images.js 自动生成 image-manifest.json，构建时静态 import
// 不再需要运行时 fetch，IMAGE_ASSETS 在模块加载时同步可用

import manifest from './images/image-manifest.json';

/** 返回图片的 WebP 路径 */
export function resolveImage(key) {
  return `${IMAGE_PATH_PREFIX}/${key}.webp`;
}

/** 生成 <img> 标签 HTML（直接 WebP，无需 <picture> fallback） */
export function imgTag(key, altText = '', cssClass = '', extraAttrs = '') {
  const src = `${IMAGE_PATH_PREFIX}/${key}.webp`;
  return `<img src="${src}" alt="${altText}" class="${cssClass}" ${extraAttrs} loading="lazy" decoding="async">`;
}

// ─── 非产品图（路径固定，不来自 manifest）────────────────────────────────────
// 命名规则：全小写 snake_case，如 logo_html、workshop_bgm
const NON_PRODUCT_KEYS = new Set([
  'logo_html', 'logo_html_2', 'workshop_bgm',
  'hero_main', 'factory_video_poster',
  'factory_gallery_1', 'factory_gallery_2', 'factory_gallery_3', 'factory_gallery_4',
  'cert_1', 'cert_2', 'cert_3', 'cert_4', 'cert_5', 'cert_6',
  'product_compact', 'product_professional', 'product_industrial',
]);

// ─── 从 manifest 构建产品图映射（构建时静态解析，运行时同步可用）────────────
const productImages = {};
for (const key of (manifest.images || [])) {
  if (!NON_PRODUCT_KEYS.has(key)) {
    productImages[key] = `${IMAGE_PATH_PREFIX}/${key}.webp`;
  }
}

// ─── 完整图片资源表 ──────────────────────────────────────────────────────────
// 所有 key 遵循 snake_case 小写命名规则，与文件名保持一致
export const IMAGE_ASSETS = {
  // 静态资源（logo、背景、场景图、证书图）
  logo:                 `${IMAGE_PATH_PREFIX}/logo_html.webp`,
  logo_dark:            `${IMAGE_PATH_PREFIX}/logo_html_2.webp`,
  hero_bg:              `${IMAGE_PATH_PREFIX}/workshop_bgm.webp`,
  hero_main:            `${IMAGE_PATH_PREFIX}/hero_main.webp`,
  factory_video_poster: `${IMAGE_PATH_PREFIX}/factory_video_poster.webp`,
  factory_gallery_1:    `${IMAGE_PATH_PREFIX}/factory_gallery_1.webp`,
  factory_gallery_2:    `${IMAGE_PATH_PREFIX}/factory_gallery_2.webp`,
  factory_gallery_3:    `${IMAGE_PATH_PREFIX}/factory_gallery_3.webp`,
  factory_gallery_4:    `${IMAGE_PATH_PREFIX}/factory_gallery_4.webp`,
  cert_1:               `${IMAGE_PATH_PREFIX}/cert_1.webp`,
  cert_2:               `${IMAGE_PATH_PREFIX}/cert_2.webp`,
  cert_3:               `${IMAGE_PATH_PREFIX}/cert_3.webp`,
  cert_4:               `${IMAGE_PATH_PREFIX}/cert_4.webp`,
  cert_5:               `${IMAGE_PATH_PREFIX}/cert_5.webp`,
  cert_6:               `${IMAGE_PATH_PREFIX}/cert_6.webp`,
  product_compact:      `${IMAGE_PATH_PREFIX}/product_compact.webp`,
  product_professional: `${IMAGE_PATH_PREFIX}/product_professional.webp`,
  product_industrial:   `${IMAGE_PATH_PREFIX}/product_industrial.webp`,
  // 产品图片（从 manifest 自动展开，新增图片无需手动维护）
  ...productImages,
};
