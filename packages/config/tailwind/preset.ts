import type { Config } from 'tailwindcss';

/**
 * Хуваалцсан Tailwind preset — touch-friendly, хүртээмжтэй (CLAUDE.md §3 UI).
 * Бүх төхөөрөмж (касс, таблет, утас, PC) дээр тогтвортой харагдах суурь.
 */
const preset: Omit<Config, 'content'> = {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        // Брэндийн өнгө — CSS хувьсагчаас (shadcn/ui-тэй нийцтэй)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Кассын дэлгэц дээр хуруугаар дарахад тохиромжтой минимум хэмжээ
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
};

export default preset;
