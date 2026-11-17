import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Tìm thẻ div có id="root" trong tệp index.html
// Sau đó xóa bỏ dòng chữ "Đang lắp ráp dự án..." và nhúng toàn bộ Ứng dụng (App) vào đó.
ReactDOM.createRoot(document.getElementById('root')).render(
  // Tạm thời tắt StrictMode để tránh việc React gọi API 2 lần ở môi trường dev gây tốn token AI
  // <React.StrictMode>
    <App />
  // </React.StrictMode>,
)