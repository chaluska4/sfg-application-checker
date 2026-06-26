/**
 * SFG Annuity Advisors — centralized design tokens and utility classes.
 */
export const theme = {
  colors: {
    navy: {
      DEFAULT: "#003366",
      light: "#004080",
      dark: "#002244",
    },
    gold: {
      DEFAULT: "#C5A059",
      light: "#D4B76A",
      muted: "#B8924A",
    },
    gray: {
      50: "#F8F9FA",
      100: "#F1F3F5",
      200: "#E9ECEF",
      300: "#DEE2E6",
      400: "#CED4DA",
      500: "#ADB5BD",
      600: "#6C757D",
      700: "#495057",
      800: "#343A40",
      900: "#212529",
    },
    red: {
      accent: "#C8102E",
      light: "#FDE8EC",
    },
    white: "#FFFFFF",
    success: "#1A7F4B",
    successLight: "#E8F5EE",
    warning: "#B8860B",
    warningLight: "#FFF8E7",
    error: "#C41E3A",
    errorLight: "#FDE8EC",
  },
  fonts: {
    sans: "var(--font-inter), system-ui, -apple-system, sans-serif",
    display: "var(--font-inter), system-ui, -apple-system, sans-serif",
  },
  shadows: {
    card: "0 4px 24px rgba(11, 31, 58, 0.08)",
    cardHover: "0 8px 32px rgba(11, 31, 58, 0.12)",
    sm: "0 1px 3px rgba(11, 31, 58, 0.06)",
  },
  radius: {
    card: "12px",
    button: "8px",
    badge: "6px",
  },
} as const;

export const statusColors = {
  "ready-to-submit": {
    bg: theme.colors.successLight,
    text: theme.colors.success,
    border: theme.colors.success,
  },
  "needs-review": {
    bg: theme.colors.warningLight,
    text: theme.colors.warning,
    border: theme.colors.warning,
  },
  "missing-required": {
    bg: theme.colors.errorLight,
    text: theme.colors.error,
    border: theme.colors.red.accent,
  },
  "manual-review": {
    bg: theme.colors.gray[100],
    text: theme.colors.gray[700],
    border: theme.colors.gray[400],
  },
} as const;
