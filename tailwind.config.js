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
        ink: '#001A57',
        primary: '#0038A7',
        'primary-light': '#DCE7FF',
        amber: '#FAB81B',
        'amber-light': '#FFF3D6',
        danger: '#E63946',
        'danger-light': '#FFE0E2',
        blue: '#2563EB',
        'blue-light': '#DBEAFE',
        stone: '#E8E4DC',
      },
      boxShadow: {
        brutal: '4px 4px 0px #001A57',
        'brutal-sm': '3px 3px 0px #001A57',
        'brutal-lg': '6px 6px 0px #001A57',
        'brutal-hover': '5px 5px 0px #001A57',
      },
    },
  },
  plugins: [],
}
