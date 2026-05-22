/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        grotesk: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        cream: '#F5F0E8',
        ink: '#0A0A0A',
        primary: '#1D9E75',
        'primary-light': '#C8F5E5',
        amber: '#F5A623',
        'amber-light': '#FEF3D0',
        danger: '#E63946',
        'danger-light': '#FFE0E2',
        blue: '#2563EB',
        'blue-light': '#DBEAFE',
        stone: '#E8E4DC',
      },
      boxShadow: {
        brutal: '4px 4px 0px #0A0A0A',
        'brutal-sm': '3px 3px 0px #0A0A0A',
        'brutal-lg': '6px 6px 0px #0A0A0A',
        'brutal-hover': '5px 5px 0px #0A0A0A',
      },
    },
  },
  plugins: [],
}
