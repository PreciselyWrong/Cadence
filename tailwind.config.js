/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        './frontend/**/*.{js,ts,jsx,tsx}', // Your React components
        './app/views/**/*.erb', // Any .erb templates that might remain
    ],
    theme: {
        extend: {
            // Palettes are CSS variables (frontend/styles/tailwind.css) so the
            // user-chosen accent and the pure-black mode reach every utility. See
            // docs/fork/DESIGN-TOKENS.md for the token table shared with Android.
            colors: {
                blue: {
                    50: 'rgb(var(--blue-50) / <alpha-value>)',
                    100: 'rgb(var(--blue-100) / <alpha-value>)',
                    200: 'rgb(var(--blue-200) / <alpha-value>)',
                    300: 'rgb(var(--blue-300) / <alpha-value>)',
                    400: 'rgb(var(--blue-400) / <alpha-value>)',
                    500: 'rgb(var(--blue-500) / <alpha-value>)',
                    600: 'rgb(var(--blue-600) / <alpha-value>)',
                    700: 'rgb(var(--blue-700) / <alpha-value>)',
                    800: 'rgb(var(--blue-800) / <alpha-value>)',
                    900: 'rgb(var(--blue-900) / <alpha-value>)',
                    950: 'rgb(var(--blue-950) / <alpha-value>)',
                },
                gray: {
                    50: 'rgb(var(--gray-50) / <alpha-value>)',
                    100: 'rgb(var(--gray-100) / <alpha-value>)',
                    200: 'rgb(var(--gray-200) / <alpha-value>)',
                    300: 'rgb(var(--gray-300) / <alpha-value>)',
                    400: 'rgb(var(--gray-400) / <alpha-value>)',
                    500: 'rgb(var(--gray-500) / <alpha-value>)',
                    600: 'rgb(var(--gray-600) / <alpha-value>)',
                    700: 'rgb(var(--gray-700) / <alpha-value>)',
                    800: 'rgb(var(--gray-800) / <alpha-value>)',
                    900: 'rgb(var(--gray-900) / <alpha-value>)',
                    950: 'rgb(var(--gray-950) / <alpha-value>)',
                },
                primary: {
                    DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
                    on: 'rgb(var(--color-on-primary) / <alpha-value>)',
                    container:
                        'rgb(var(--color-primary-container) / <alpha-value>)',
                    'on-container':
                        'rgb(var(--color-on-primary-container) / <alpha-value>)',
                },
                surface: {
                    DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
                    on: 'rgb(var(--color-on-surface) / <alpha-value>)',
                    variant:
                        'rgb(var(--color-surface-variant) / <alpha-value>)',
                    'on-variant':
                        'rgb(var(--color-on-surface-variant) / <alpha-value>)',
                    card: 'rgb(var(--color-card) / <alpha-value>)',
                    low: 'rgb(var(--color-container-low) / <alpha-value>)',
                    high: 'rgb(var(--color-container-high) / <alpha-value>)',
                    highest:
                        'rgb(var(--color-container-highest) / <alpha-value>)',
                },
                outline: {
                    DEFAULT: 'rgb(var(--color-outline) / <alpha-value>)',
                    variant:
                        'rgb(var(--color-outline-variant) / <alpha-value>)',
                },
                ink: {
                    DEFAULT: 'rgb(var(--color-on-surface) / <alpha-value>)',
                    muted: 'rgb(var(--color-on-surface-variant) / <alpha-value>)',
                },
                danger: {
                    DEFAULT: 'rgb(var(--color-error) / <alpha-value>)',
                    on: 'rgb(var(--color-on-error) / <alpha-value>)',
                    container:
                        'rgb(var(--color-error-container) / <alpha-value>)',
                    'on-container':
                        'rgb(var(--color-on-error-container) / <alpha-value>)',
                },
                success: {
                    DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
                    container:
                        'rgb(var(--color-success-container) / <alpha-value>)',
                },
                warning: {
                    DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
                    container:
                        'rgb(var(--color-warning-container) / <alpha-value>)',
                },
            },
            fontFamily: {
                sans: [
                    '"Plus Jakarta Sans"',
                    'ui-sans-serif',
                    'system-ui',
                    'sans-serif',
                ],
            },
            // Android type roles (Type.kt). rem = px / 14.4 because the root font
            // size is 90%. xs is 12px, the minimum text size.
            fontSize: {
                xs: ['0.8333rem', { lineHeight: '1.1111rem' }],
                display: [
                    '2.0833rem',
                    {
                        lineHeight: '2.5rem',
                        letterSpacing: '-0.5px',
                        fontWeight: '600',
                    },
                ],
                headline: [
                    '1.6667rem',
                    {
                        lineHeight: '2.2222rem',
                        letterSpacing: '-0.5px',
                        fontWeight: '600',
                    },
                ],
                title: [
                    '1.3889rem',
                    { lineHeight: '1.8056rem', fontWeight: '600' },
                ],
                'title-m': [
                    '1.1111rem',
                    { lineHeight: '1.5278rem', fontWeight: '700' },
                ],
                body: ['1.1111rem', { lineHeight: '1.6667rem' }],
                'body-m': ['0.9722rem', { lineHeight: '1.3889rem' }],
                label: [
                    '0.9722rem',
                    { lineHeight: '1.3889rem', fontWeight: '500' },
                ],
                'label-m': [
                    '0.8333rem',
                    { lineHeight: '1.1111rem', fontWeight: '500' },
                ],
                metric: [
                    '2.2222rem',
                    {
                        lineHeight: '2.5rem',
                        letterSpacing: '-0.5px',
                        fontWeight: '600',
                    },
                ],
            },
            // Android Radius: chip 12, control 16, fab 18, card 20, panel 24,
            // sheet 28. Tailwind's own rounded-* keep their meaning.
            borderRadius: {
                inner: '4px',
                checkbox: '8px',
                chip: '12px',
                control: '16px',
                fab: '18px',
                card: '20px',
                panel: '24px',
                sheet: '28px',
            },
            spacing: {
                sidebar: 'var(--sidebar-width, 22rem)',
                rail: '3.5rem',
            },
            keyframes: {
                'scale-in': {
                    '0%': { transform: 'scale(0.8)', opacity: '0.5' },
                    '50%': { transform: 'scale(1.1)' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'check-pop': {
                    '0%': { transform: 'scale(0.82)' },
                    '60%': { transform: 'scale(1.08)' },
                    '100%': { transform: 'scale(1)' },
                },
                'check-draw': {
                    '0%': { strokeDashoffset: '24' },
                    '100%': { strokeDashoffset: '0' },
                },
                'inbox-row-in': {
                    '0%': { opacity: '0', transform: 'translateY(-5px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'inbox-detach': {
                    '0%': {
                        transform: 'scale(0.985)',
                        boxShadow: '0 0 0 rgba(0,0,0,0)',
                    },
                    '100%': { transform: 'scale(1)' },
                },
            },
            animation: {
                'scale-in': 'scale-in 0.3s ease-out',
                'fade-in': 'fade-in 0.3s ease-out',
                'check-pop': 'check-pop 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                'check-draw': 'check-draw 180ms ease-out 40ms both',
                'inbox-row-in': 'inbox-row-in 0.22s ease-out',
                'inbox-detach':
                    'inbox-detach 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)',
            },
        },
    },
    plugins: [],
    // theme: {
    //   extend: {
    //     colors: {
    //       // Override the default colors in dark mode
    //       gray: {
    //         50: '#f9f9f9',  // Lightest gray (near white)
    //         100: '#f0f0f0', // Lighter gray
    //         200: '#e0e0e0', // Lighter gray
    //         300: '#c0c0c0', // Light gray
    //         400: '#a0a0a0', // Gray
    //         500: '#808080', // Neutral gray
    //         600: '#606060', // Darker gray
    //         700: '#404040', // Even darker gray
    //         800: '#202020', // Near black
    //         900: '#101010', // Darkest gray (almost black)
    //       },
    //       background: {
    //         DEFAULT: '#000000', // Black background in dark mode
    //       },
    //       text: {
    //         DEFAULT: '#ffffff', // White text in dark mode
    //       },
    //     },
    //   },
    // },
};
