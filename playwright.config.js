// ============================================================================
// FILE: playwright.config.js
// NGUỒN GỐC: Bước 3B — Hệ thống Kiểm thử Tự động 2 Tầng (Playwright E2E Bot)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 13:08 (GMT+7)
// NHIỆM VỤ: Cấu hình Bot Chrome thật (Chromium) chạy Smoke Test tự động trên
//           ứng dụng Vite (http://localhost:3000), tự khởi động hoặc tái sử dụng
//           dev server đang mở, tự động chụp ảnh hiện trường & ghi Trace khi có lỗi.
// ============================================================================

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.{js,mjs}',
  timeout: 45 * 1000,
  expect: {
    timeout: 10 * 1000
  },
  // Chạy tuần tự để tránh xung đột IndexedDB / tài nguyên trên máy cá nhân
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1366, height: 820 },
    actionTimeout: 10 * 1000,
    navigationTimeout: 20 * 1000,
    // Tự động chụp ảnh & lưu Trace khi phát hiện lỗi trắng màn hình / crash
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm run dev -- --port 3000',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000
  }
});