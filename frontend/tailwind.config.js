/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'rich-black': 'var(--bg-primary)',
                'deep-space': 'var(--bg-secondary)',
                'obsidian-black': 'var(--glass-bg)',
                'obsidian-gold': 'var(--accent-primary)',
                'obsidian-gold-dim': 'var(--accent-secondary)',
                'obsidian-platinum': 'var(--text-secondary)',
                'obsidian-silver': '#C0C0C0', // Keeping static for now or map to secondary
                'obsidian-accent': 'var(--text-primary)',
                'glass-white': 'rgba(255, 255, 255, 0.03)',
                'glass-border': 'var(--border-color)',
                'gold-border': 'var(--accent-dim)',
            },
            fontFamily: {
                'outfit': ['Outfit', 'sans-serif'],
                'inter': ['Inter', 'sans-serif'],
            },
            backgroundImage: {
                'obsidian-gradient': "radial-gradient(circle at 50% 50%, #1a1a1a 0%, #000000 100%)",
                'gold-gradient': "linear-gradient(135deg, #FFD700 0%, #B8860B 100%)",
                'platinum-gradient': "linear-gradient(135deg, #E5E4E2 0%, #C0C0C0 100%)",
            },
            animation: {
                'fade-in-up': 'fadeInUp 0.8s ease-out',
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 6s ease-in-out infinite',
                'shine': 'shine 3s linear infinite',
            },
            keyframes: {
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
                shine: {
                    'to': { backgroundPosition: '200% center' }
                }
            },
        },
    },
    plugins: [],
}