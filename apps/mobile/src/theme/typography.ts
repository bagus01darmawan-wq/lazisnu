import {Colors} from './colors';

export const Typography = {
  display: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: Colors.text.primary,
    letterSpacing: -1,
  },
  heading1: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  heading2: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text.primary,
  },
  heading3: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text.primary,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    color: Colors.text.primary,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.text.secondary,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text.primary,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.text.muted,
  },
  button: {
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
};
