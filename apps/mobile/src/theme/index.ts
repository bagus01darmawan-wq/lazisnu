// Global Design System - Lazisnu Collector App

export const Colors = {
  primary: {
    main: '#10B981', // Emerald 500
    dark: '#059669', // Emerald 600
    light: '#D1FAE5', // Emerald 100
    contrast: '#FFFFFF',
  },
  secondary: {
    main: '#3B82F6', // Blue 500
    dark: '#2563EB', // Blue 600
    light: '#DBEAFE', // Blue 100
    contrast: '#FFFFFF',
  },
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
  status: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: {
    primary: '#0F172A',
    secondary: '#64748B',
    muted: '#94A3B8',
    white: '#FFFFFF',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Typography = {
  h1: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text.primary,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text.primary,
  },
  body1: {
    fontSize: 16,
    fontWeight: '400' as const,
    color: Colors.text.primary,
  },
  body2: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.text.secondary,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.text.muted,
  },
  button: {
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
};

export const Shadows = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  hard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
};

export default {
  Colors,
  Spacing,
  Typography,
  Shadows,
};
