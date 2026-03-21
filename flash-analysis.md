# 页面加载样式闪烁分析报告

## 问题描述

初次进入页面时,会先看到没有样式的 HTML 内容(FOUC - Flash of Unstyled Content),然后才显示完整的样式。

## 根本原因分析

### 1. **样式加载延迟导致的 FOUC**
   - **现状**: Tailwind CSS 通过 `@tailwind base; @tailwind components; @tailwind utilities;` 引入
   - **问题**: 这些指令生成的 CSS 体积较大,加载需要时间
   - **结果**: 浏览器在 CSS 加载完成前已经渲染了裸露的 HTML

### 2. **CSS 文件加载顺序**
   - `styles.css` 在 HTML 中通过 `<link rel="stylesheet" href="dist/styles.css">` 引入
   - 如果 JavaScript 也在加载,可能会阻塞渲染

### 3. **骨架屏的作用有限**
   - 骨架屏虽然占位,但只在 JavaScript 执行到 `hideSkeletonScreen()` 时才隐藏
   - 在 CSS 加载完成之前,用户可能先看到没有样式的实际内容

## 优化方案

### 方案 1: 添加关键内联 CSS (Critical CSS) ✅ **推荐**

在 `<head>` 中添加关键 CSS,确保首屏内容立即有基本样式:

```html
<style>
  /* 关键 CSS - 防止 FOUC */
  body {
    background: #f7f6f7;
    color: #0f172a;
  }
  .dark body {
    background: #18151d;
    color: #f1f5f9;
  }
  #skeleton-screen {
    position: relative;
    background: white;
    z-index: 10;
  }
  .dark #skeleton-screen {
    background: #1a202c;
  }
  #app-container {
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  #app-container.loaded {
    opacity: 1;
  }
</style>
```

### 方案 2: 隐藏初始内容直到样式加载

```javascript
// 在 <head> 中添加内联脚本
<script>
  // 防止 FOUC - 在样式加载前隐藏内容
  document.documentElement.style.visibility = 'hidden';
  document.addEventListener('DOMContentLoaded', function() {
    document.documentElement.style.visibility = 'visible';
  });
</script>
```

### 方案 3: 异步加载非关键 CSS

```html
<!-- 关键 CSS 内联 -->
<style>
  /* 首屏必要样式 */
</style>

<!-- 其他 CSS 异步加载 -->
<link rel="preload" href="dist/styles.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="dist/styles.css"></noscript>
```

## 产品卡片背景色调整

### 当前状态
- 优势卡片 (vorteil-card): `bg-background-light dark:bg-primary/5`
- 认证卡片 (cert-card): `bg-background-light dark:bg-slate-800`

### 需求
将产品卡片背景色改为纯白色

### 修改方案
将 `bg-background-light` 改为 `bg-white`,保持深色模式的一致性

## 推荐实施方案

**组合方案 (最佳性能)**:
1. 使用方案 1 (关键内联 CSS)
2. 结合方案 3 (异步加载非关键样式)
3. 调整骨架屏显示逻辑,确保在 CSS 加载完成后才显示实际内容

### 预期效果
- ✅ 消除 FOUC (样式闪烁)
- ✅ 首屏加载更平滑
- ✅ 产品卡片使用纯白色背景
- ✅ 保持深色模式兼容性
