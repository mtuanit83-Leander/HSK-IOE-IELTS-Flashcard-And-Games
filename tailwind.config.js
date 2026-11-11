/**
 * @file tailwind.config.js
 * @description Cấu hình TailwindCSS & Safelist bảo vệ các class màu sắc động
 * @origin Giai đoạn 1 - Khởi tạo Khung Dự án
 */


export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // ĐIỀU 4 - KHOẢN 1 CỦA HIẾN PHÁP: BẢO VỆ CLASS ĐỘNG (SAFELIST)
  safelist: [
    {
      // Quét và giữ lại tất cả các biến thể màu sắc động được dùng trong ứng dụng
      pattern: /(bg|text|border|ring|shadow|fill|from|to)-(sky|red|indigo|blue|emerald|purple|orange|green|slate|cyan|pink|yellow|teal|rose)-(50|100|200|300|400|500|600|700|800|900)/,
      variants: ['hover', 'focus', 'active', 'group-hover', 'disabled'],
    },
    // Các class animation được gọi động
    'animate-pulse',
    'animate-spin',
    'animate-bounce',
    'animate-in',
    'fade-in',
    'zoom-in',
    'slide-in-from-bottom-2',
    'slide-in-from-bottom-4',
    'slide-in-from-top-2',
    'slide-in-from-top-4',
    'slide-in-from-right-8'
  ],
  theme: {
    extend: {
      // Chuyển hiệu ứng rung lắc (shake) từ inline CSS cũ sang Tailwind config
      animation: {
        'shake': 'shake 0.4s ease-in-out',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-5px)' },
          '40%, 80%': { transform: 'translateX(5px)' },
        }
      }
    },
  },
  plugins: [],
}

