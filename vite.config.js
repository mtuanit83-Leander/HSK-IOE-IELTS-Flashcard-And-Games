/**
 * @file vite.config.js
 * @description Cấu hình trình biên dịch Vite và thiết lập đường dẫn tắt (Path Alias)
 * @origin Giai đoạn 1 - Khởi tạo Khung Dự án
 */


import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';


// Cấu hình chuẩn để sử dụng __dirname trong môi trường ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Định tuyến '@/' trỏ thẳng vào thư mục 'src/'
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true, // Hỗ trợ debug trên production nếu cần
  }
});

