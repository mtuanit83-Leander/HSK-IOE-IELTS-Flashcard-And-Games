// ============================================================================
// FILE: vitest.config.js
// NGUỒN GỐC: Bước 3A — Hệ thống Kiểm thử Tự động 2 Tầng (Vitest Unit Runner)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 13:03 (GMT+7)
// NHIỆM VỤ: Cấu hình độc lập cho Vitest (tách biệt hoàn toàn với vite.config.js
//           để không ảnh hưởng luồng build sản phẩm), ánh xạ alias `@` -> `src/`,
//           bật môi trường giả lập DOM (jsdom) và quét toàn bộ tests/unit/.
// ============================================================================

import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  esbuild: {
    jsx: 'automatic'
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{js,jsx,mjs}'],
    exclude: ['node_modules', 'dist', 'build', 'tests/e2e/**'],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    testTimeout: 15000,
    reporters: ['verbose']
  }
});