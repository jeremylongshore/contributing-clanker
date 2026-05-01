'use client';

/**
 * Theme Context
 *
 * Provides host-based theming throughout the app.
 * Detects domain on mount and applies appropriate theme.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { SiteTheme, getThemeForHost, themes } from './config';

interface ThemeContextType {
  theme: SiteTheme;
  setThemeById: (id: string) => void;
  isDark: boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<SiteTheme>(themes.default);
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Detect theme from hostname
    if (typeof window !== 'undefined') {
      const detectedTheme = getThemeForHost(window.location.hostname);
      setTheme(detectedTheme);

      // Check for dark mode preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const savedDark = localStorage.getItem('theme-dark');
      setIsDark(savedDark !== null ? savedDark === 'true' : prefersDark);

      setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      // Apply CSS custom properties for theme colors
      const root = document.documentElement;
      root.style.setProperty('--color-primary', theme.colors.primary);
      root.style.setProperty('--color-primary-hover', theme.colors.primaryHover);
      root.style.setProperty('--color-primary-light', theme.colors.primaryLight);
      root.style.setProperty('--color-accent', theme.colors.accent);
      root.style.setProperty('--gradient-from', theme.colors.gradient.from);
      root.style.setProperty('--gradient-to', theme.colors.gradient.to);

      // Apply dark mode class
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [theme, isDark, mounted]);

  const setThemeById = (id: string) => {
    const newTheme = Object.values(themes).find(t => t.id === id);
    if (newTheme) {
      setTheme(newTheme);
    }
  };

  const toggleDark = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme-dark', String(newDark));
    }
  };

  // Prevent flash of unstyled content
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-transparent" />
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, setThemeById, isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
