// ============================================================================
// FILE 85/85: src/main.jsx
// NGUỒN GỐC: Tầng 7 (Block 7.1 - Application Entry Point)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 28/11/2026 - 05:51 (GMT+7)
// NHIỆM VỤ: Điểm khởi chạy chính thức của ứng dụng React 18 + Vite.
//           Nạp index.css, đồng bộ thư viện toàn cục, bọc <App /> trong
//           <ErrorBoundary> và <AppProvider>, sau đó mount vào #root.
//           Nâng cấp Ver 1.0 (Giai đoạn 5 - Lượt 5.1 - Chốt hạ Radar 0/0/0):
//           1. Diệt 1/1 MEDIUM Radar cuối cùng (R05): Thay localStorage.setItem
//              trần cho 'fc_lang' bằng Utils.safeLocalStorageSet.
//           2. Diệt S19: Chuẩn hóa & thanh trùng toàn bộ biến thể chuỗi ngôn ngữ
//              cũ ('vi', '"vi"', 'VI', khoảng trắng thừa) về JSON.stringify('en')
//              tương thích 100% với useCoreState.
//           3. Đảm bảo 0 Problems tsc --noEmit, 0 hints Knip & giữ nguyên cây
//              khởi chạy <ErrorBoundary><AppProvider><App /></AppProvider></ErrorBoundary>.
// ============================================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import * as XLSX from 'xlsx';

import './index.css';
import { Utils } from '@/utils/helpers';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AppProvider } from '@/context/AppContext';
import { App } from './App';

// Đồng bộ thư viện XLSX lên biến toàn cục window để hỗ trợ các hàm xuất/nhập Excel
if (typeof window !== 'undefined' && !/** @type {any} */ (window).XLSX) {
  /** @type {any} */ (window).XLSX = XLSX;
}

// Chốt chặn bảo vệ thanh trùng toàn bộ biến thể ngôn ngữ cũ ('vi') trước khi khởi chạy
try {
  if (typeof localStorage !== 'undefined') {
    const savedLang = localStorage.getItem('fc_lang');
    if (typeof savedLang === 'string') {
      const normalizedLang = savedLang
        .replace(/^["']+|["']+$/g, '')
        .trim()
        .toLowerCase();
      if (normalizedLang === 'vi') {
        Utils.safeLocalStorageSet('fc_lang', JSON.stringify('en'));
      }
    }
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