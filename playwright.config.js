// ============================================================================
// FILE CẤU HÌNH E2E: playwright.config.js
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 07:28 (GMT+7)
// NHIỆM VỤ: Cấu hình Bot Kiểm thử Giao diện Thực tế (Playwright + Chromium)
//           trên cổng 3000; tắt tự bật tab bằng --no-open, nâng timeout
//           chống lỗi cold-start Vite 5 trên Windows (80 files + gói xlsx)
//           và ghi lại ảnh chụp + trace khi phát hiện lỗi.
// ============================================================================

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Thư mục chứa toàn bộ kịch bản kiểm thử E2E
  testDir: './tests/e2e',

  // Thời gian tối đa cho mỗi test case (60 giây để đủ biên độ cold-start + reload)
  timeout: 60_000,

  // Thời gian chờ mặc định cho các khẳng định expect(...)
  expect: {
    timeout: 15_000,
  },

  // Chạy tuần tự trên 1 worker để không làm nghẽn Vite dev server khi biên dịch lạnh
  fullyParallel: false,
  workers: 1,

  // Chặn test.only vô tình lọt vào môi trường CI
  forbidOnly: !!process.env.CI,

  // Cục bộ chạy 1 lượt để phản hồi nhanh; trên CI tự thử lại tối đa 2 lần
  retries: process.env.CI ? 2 : 0,

  // Xuất kết quả gọn gàng ra Terminal và lưu báo cáo HTML tĩnh (không tự bật trình duyệt)
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    // Khớp chuẩn cổng 3000 trong vite.config.js
    baseURL: 'http://localhost:3000',

    // Nâng ngưỡng chờ tải trang & thao tác để không timeout khi Vite pre-bundle lần đầu
    navigationTimeout: 45_000,
    actionTimeout: 15_000,

    // Tự động lưu ảnh chụp màn hình và trace khi có bất kỳ test nào thất bại
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',

    // Khung hình chuẩn Desktop để kiểm tra đủ Header, Flashcard 3D, Modal và sảnh Game
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Tự động khởi động Vite dev server nếu cổng 3000 chưa chạy; tái sử dụng nếu đã bật sẵn
  webServer: {
    command: 'npx vite --port 3000 --strictPort --no-open',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});