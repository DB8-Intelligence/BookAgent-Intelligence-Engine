import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Paleta INTERMETRIX — Luxury Real Estate
        ink: {
          DEFAULT: "#0A1E3F",  // Azul Profundo — backgrounds dramáticos
          900: "#050F24",
          800: "#0A1E3F",
          700: "#142B56",
          600: "#1F3A6F",
          500: "#2A4888",
          400: "#4E6AA0",
          300: "#7A8FB8",
        },
        gold: {
          DEFAULT: "#D4AF37",  // Dourado — acento autoritário
          900: "#8B7125",
          800: "#A6872E",
          700: "#BF9D34",
          600: "#CFA639",
          500: "#D4AF37",
          400: "#DEBE58",
          300: "#E8CE7A",
          200: "#F1DEA0",
          100: "#F9EFCC",
        },
        cream: "#F9F6F0",       // Fundo claro sofisticado
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
