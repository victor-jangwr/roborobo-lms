/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), sunken: v('sunken'), line: v('line'),
        ink: v('ink'), muted: v('muted'), faint: v('faint'),
        accent: v('accent'), 'accent-ink': v('accent-ink'), 'accent-soft': v('accent-soft'),
        good: v('good'), warn: v('warn'), late: v('late'), bad: v('bad'), done: v('done'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans KR"', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { xl: '14px', lg: '10px', md: '8px' },
      boxShadow: {
        card: '0 1px 0 rgb(var(--line) / 0.6), 0 1px 2px rgb(var(--shadow) / 0.06)',
        pop: '0 12px 40px -8px rgb(var(--shadow) / 0.28), 0 2px 6px rgb(var(--shadow) / 0.08)',
      },
    },
  },
  plugins: [],
}
