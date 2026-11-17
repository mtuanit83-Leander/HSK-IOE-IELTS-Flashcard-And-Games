export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {
      // Quét và giữ lại tất cả các biến thể màu sắc động (bao gồm cả shadow và accent cho thanh trượt)
      pattern: /(bg|text|border|ring|shadow|accent|fill|from|to)-(sky|red|indigo|blue|emerald|purple|orange|green|slate|cyan|pink|yellow|teal|rose)-(50|100|200|300|400|500|600|700|800|900)/,
      variants: ['hover', 'focus', 'active', 'group-hover', 'disabled'],
    },
    // Các class animation được gọi động qua biến điều kiện
    'animate-pulse',
    'animate-spin',
    'animate-bounce',
    'animate-shake',
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
      fontFamily: {
        sans: ['"Noto Sans SC"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif SC"', 'ui-serif', 'Georgia', 'serif'],
        kaiti: ['"KaiTi"', '"STKaiti"', '"楷体"', '"LXGW WenKai Lite"', '"Ma Shan Zheng"', 'serif'],
        callig: ['"Long Cang"', 'cursive'],
      },
      animation: {
        'shake': 'shake 0.4s ease-in-out',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-5px)' },
          '40%, 80%': { transform: 'translateX(5px)' },
        },
      },
    },
  },
  plugins: [],
};
