import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      // Tighter side gutter on mobile (16px), the previous 24px from sm up.
      padding: {
        DEFAULT: "1rem",
        sm: "1.5rem",
      },
      screens: {
        "2xl": "1200px",
      },
    },
    // Override default font sizes to M3 typescale
    // body standard = 16px, labels = 14px, 12px = very niche only
    fontSize: {
      xs:   ["0.875rem",  { lineHeight: "1.4", letterSpacing: "0.5px" }],   // 14px — label
      sm:   ["1rem",      { lineHeight: "1.6", letterSpacing: "0.5px" }],   // 16px — body (standard)
      base: ["1rem",      { lineHeight: "1.6", letterSpacing: "0.25px" }],  // 16px — body-large
      lg:   ["1.125rem",  { lineHeight: "1.6", letterSpacing: "0" }],       // 18px — body-larger
      xl:   ["1.25rem",   { lineHeight: "1.4", letterSpacing: "0" }],       // 20px — title
      "2xl": ["1.5rem",   { lineHeight: "1.3", letterSpacing: "0" }],       // 24px — headline-small
      "3xl": ["1.75rem",  { lineHeight: "1.3", letterSpacing: "0" }],       // 28px — headline-medium
      "4xl": ["2.25rem",  { lineHeight: "1.2", letterSpacing: "0" }],       // 36px — display-small
      "5xl": ["2.8125rem",{ lineHeight: "1.2", letterSpacing: "0" }],       // 45px — display-medium
      "6xl": ["3.5625rem",{ lineHeight: "1.2", letterSpacing: "0" }],       // 57px — display-large
    },
    extend: {
      screens: {
        xs: "600px",
      },
      fontFamily: {
        heading: ["Plus Jakarta Sans", "sans-serif"],
        // Moderat is direct-hire's licensed font and is not in this public repo;
        // Plus Jakarta Sans stands in until a licensed copy is added.
        body: ["Moderat", "Plus Jakarta Sans", "sans-serif"],
      },
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        "surface-red": "var(--surface-red)",
        // ⚠️ NOT GREEN, despite the name — resolves to a neutral composite
        // surface in both themes. See the token's own comment in index.css. For
        // an actually-green surface use success-container below.
        "surface-green": "var(--surface-green)",
        "text-red": "var(--text-red)",
        "text-green": "var(--text-green)",
        "success-container": "var(--success-container)",
        "on-success-container": "var(--on-success-container)",
        "layer-1": "var(--layer-1)",
        "layer-2": "var(--layer-2)",
        "layer-3": "var(--layer-3)",
        // M3 direct access colors
        "m3-primary-container": "var(--color-primary-container)",
        "m3-on-primary-container": "var(--color-on-primary-container)",
        "m3-secondary": "var(--color-secondary)",
        "m3-on-secondary": "var(--color-on-secondary)",
        "m3-secondary-container": "var(--color-secondary-container)",
        "m3-on-secondary-container": "var(--color-on-secondary-container)",
        "m3-tertiary": "var(--color-tertiary)",
        "m3-surface": "var(--color-surface)",
        "m3-on-surface": "var(--color-on-surface)",
        "m3-surface-variant": "var(--color-surface-variant)",
        "m3-on-surface-variant": "var(--color-on-surface-variant)",
        "m3-outline": "var(--color-outline)",
        "m3-outline-variant": "var(--color-outline-variant)",
        // Custom semantic colors (from colors.scss $custom / $custom-light).
        // `custom-{name}` is the mode-aware chip SURFACE: light tint in light mode,
        // saturated tone in dark mode (the flip lives in colors.scss .dark block).
        // A status chip is `bg-custom-{name} text-m3-on-surface` and reads in both modes.
        // `-light` = always the light tint; `-saturated` = always the saturated tone
        // (for dots/accents that shouldn't flip).
        "custom-blue": "var(--color-custom-blue)",
        "custom-blue-light": "var(--color-custom-blue-light)",
        "custom-blue-saturated": "var(--color-custom-blue-saturated)",
        "custom-brown": "var(--color-custom-brown)",
        "custom-brown-light": "var(--color-custom-brown-light)",
        "custom-brown-saturated": "var(--color-custom-brown-saturated)",
        "custom-cyan": "var(--color-custom-cyan)",
        "custom-cyan-light": "var(--color-custom-cyan-light)",
        "custom-cyan-saturated": "var(--color-custom-cyan-saturated)",
        "custom-gray": "var(--color-custom-gray)",
        "custom-gray-light": "var(--color-custom-gray-light)",
        "custom-gray-saturated": "var(--color-custom-gray-saturated)",
        "custom-green": "var(--color-custom-green)",
        "custom-green-light": "var(--color-custom-green-light)",
        "custom-green-saturated": "var(--color-custom-green-saturated)",
        "custom-orange": "var(--color-custom-orange)",
        "custom-orange-light": "var(--color-custom-orange-light)",
        "custom-orange-saturated": "var(--color-custom-orange-saturated)",
        "custom-pink": "var(--color-custom-pink)",
        "custom-pink-light": "var(--color-custom-pink-light)",
        "custom-pink-saturated": "var(--color-custom-pink-saturated)",
        "custom-yellow": "var(--color-custom-yellow)",
        "custom-yellow-light": "var(--color-custom-yellow-light)",
        "custom-yellow-saturated": "var(--color-custom-yellow-saturated)",
        "custom-purple": "var(--color-custom-purple)",
        "custom-purple-light": "var(--color-custom-purple-light)",
        "custom-purple-saturated": "var(--color-custom-purple-saturated)",
        "custom-red": "var(--color-custom-red)",
        "custom-red-light": "var(--color-custom-red-light)",
        "custom-red-saturated": "var(--color-custom-red-saturated)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        pill: "100px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-4px)" },
          "40%": { transform: "translateX(4px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shake: "shake 0.4s ease-in-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
