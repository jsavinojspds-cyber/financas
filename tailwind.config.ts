import type { Config } from 'tailwindcss'

/**
 * Design tokens do neumorfismo roxo, extraídos 1:1 do index.html original
 * para que a migração não mude nem um pixel da identidade visual.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fundo: '#e8e0f0', // fundo principal do app
        superficie: '#eee8f8', // cards elevados
        'superficie-2': '#e2d9f0', // faixa de conteúdo / trilhos
        borda: '#d4c9e8',
        accent: {
          DEFAULT: '#7c3aed',
          claro: '#8b5cf6',
          escuro: '#6d28d9',
        },
        tinta: '#2d1b69', // texto principal
        'tinta-2': '#7c6b9e', // texto secundário
        'tinta-3': '#a592c0', // texto terciário / placeholder
        receita: '#10b981',
        despesa: '#ef4444',
        alerta: '#f59e0b',
        info: '#3b82f6',
        // sombras do neumorfismo
        'neu-escura': '#c8bfe0',
        'neu-clara': '#ffffff',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        neu: '6px 6px 12px #c8bfe0, -6px -6px 12px #ffffff',
        'neu-sm': '4px 4px 8px #c8bfe0, -4px -4px 8px #ffffff',
        'neu-xs': '3px 3px 8px #c8bfe0, -3px -3px 8px #ffffff',
        'neu-in': 'inset 3px 3px 6px #c8bfe0, inset -3px -3px 6px #ffffff',
        'neu-in-sm': 'inset 2px 2px 4px #c8bfe0, inset -2px -2px 4px #ffffff',
      },
      keyframes: {
        slideUp: {
          from: { opacity: '0', transform: 'translateX(-50%) translateY(14px)' },
          to: { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
        },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        sheetIn: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%,60%': { transform: 'translateX(-8px)' },
          '40%,80%': { transform: 'translateX(8px)' },
        },
        pinIn: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        crescerBarra: { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
      },
      animation: {
        slideUp: 'slideUp .28s cubic-bezier(.32,.72,0,1)',
        fadeIn: 'fadeIn .15s ease',
        sheetIn: 'sheetIn .25s cubic-bezier(.32,.72,0,1)',
        shake: 'shake .35s ease',
        pinIn: 'pinIn .35s cubic-bezier(.32,.72,0,1)',
        crescerBarra: 'crescerBarra .4s cubic-bezier(.32,.72,0,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config
