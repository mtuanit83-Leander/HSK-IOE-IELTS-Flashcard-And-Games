// ============================================================================
// FILE 85/85: src/main.jsx
// NGUỒN GỐC: Tầng 7 (Block 7.1 - Application Entry Point)
// NHIỆM VỤ: Điểm khởi chạy chính thức của ứng dụng React 18 + Vite.
//           Nạp index.css, đồng bộ thư viện toàn cục, bọc <App /> trong
//           <ErrorBoundary> và <AppProvider>, sau đó mount vào #root.
// ============================================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import * as XLSX from 'xlsx';

import './index.css';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AppProvider } from '@/context/AppContext';
import { App } from './App';

// Đồng bộ thư viện XLSX lên biến toàn cục window để hỗ trợ các hàm xuất/nhập Excel
if (typeof window !== 'undefined' && !window.XLSX) {
  window.XLSX = XLSX;
}

// Chốt chặn bảo vệ thanh trùng ngôn ngữ cũ ('vi') trước khi khởi chạy
try {
  const savedLang = localStorage.getItem('fc_lang');
  if (savedLang === 'vi' || savedLang === '"vi"') {
    localStorage.setItem('fc_lang', JSON.stringify('en'));
  }
} catch {
  // Bỏ qua nếu trình duyệt chặn quyền truy cập bộ nhớ cục bộ
}

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  );
}