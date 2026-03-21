// tailwind.config.js
module.exports = {
  content: [
    './src/index.html',
    './src/**/*.{js,jsx,ts,tsx}', // 根据你的实际文件路径调整
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary': '#271b3b',
        'primary-light': '#3a2a52',
        'background-light': '#f7f6f7',
        'background-dark': '#18151d',
        'accent': '#e84545',
        'success': '#22c55e'
      },
    },
  },
  plugins: [],
};