/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-light': 'var(--primary-light)',
        'primary-soft': 'rgba(124, 58, 237, 0.1)',

        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',

        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--divider)',

        success: 'var(--success)',
        error: 'var(--error)',
        warning: 'var(--warning)',

        border: 'var(--border)',
        divider: 'var(--divider)',

        /* Legacy support mappings */
        surface: 'var(--bg-secondary)',
        'surface-muted': 'var(--bg-primary)',
        bg: 'var(--bg-primary)',
        accent: 'var(--primary-light)',
        'secondary-soft': 'rgba(148, 163, 184, 0.1)',
      },
      spacing: {
        1: 'var(--or-space-1)',
        2: 'var(--or-space-2)',
        3: 'var(--or-space-3)',
        4: 'var(--or-space-4)',
        6: 'var(--or-space-6)',
        8: 'var(--or-space-8)',
        10: 'var(--or-space-10)',
        12: 'var(--or-space-12)',

        /* Legacy Zen spacing mappings */
        'zen-xs': 'var(--or-space-1)',
        'zen-sm': 'var(--or-space-2)',
        'zen-md': 'var(--or-space-4)',
        'zen-lg': 'var(--or-space-6)',
        'zen-xl': 'var(--or-space-8)',
        'zen-xxl': 'var(--or-space-10)',
        'zen-section': 'var(--or-space-12)',

        /* Legacy Zen control/icon mappings */
        'zen-control-sm': 'var(--or-space-8)',
        'zen-control-md': 'var(--or-space-10)',
        'zen-control-lg': 'var(--or-space-12)',
        'zen-icon-sm': 'var(--or-space-4)',
        'zen-icon-md': 'var(--or-space-6)',
        'zen-icon-lg': 'var(--or-space-8)',
        'zen-ornament': 'var(--or-space-12)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',

        /* Legacy Zen radius mappings */
        'zen-sm': 'var(--radius-sm)',
        'zen-md': 'var(--radius-md)',
        'zen-lg': 'var(--radius-lg)',
        'zen-xl': 'var(--radius-lg)',
        'zen-card': 'var(--radius-lg)',
      },
      letterSpacing: {
        'zen-wide': '0.1em',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
