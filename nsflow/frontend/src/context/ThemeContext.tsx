// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider, Theme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';

// Define our custom theme colors
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2563eb', // Blue
      light: '#3b82f6',
      dark: '#1d4ed8',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#10b981', // Emerald
      light: '#34d399',
      dark: '#059669',
      contrastText: '#ffffff',
    },
    error: {
      main: '#ef4444', // Red
      light: '#f87171',
      dark: '#dc2626',
    },
    warning: {
      main: '#f59e0b', // Amber
      light: '#fbbf24',
      dark: '#d97706',
    },
    success: {
      main: '#10b981', // Emerald
      light: '#34d399',
      dark: '#059669',
    },
    background: {
      default: '#f8fafc', // Slate-50
      paper: '#ffffff',
    },
    text: {
      primary: '#1e293b', // Slate-800
      secondary: '#64748b', // Slate-500
    },
    divider: '#e2e8f0', // Slate-200
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#3b82f6', // Blue
      light: '#60a5fa',
      dark: '#2563eb',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#10b981', // Emerald
      light: '#34d399',
      dark: '#059669',
      contrastText: '#ffffff',
    },
    error: {
      main: '#f87171', // Red
      light: '#fca5a5',
      dark: '#ef4444',
    },
    warning: {
      main: '#fbbf24', // Amber
      light: '#fcd34d',
      dark: '#f59e0b',
    },
    success: {
      main: '#34d399', // Emerald
      light: '#6ee7b7',
      dark: '#10b981',
    },
    background: {
      default: '#0f172a', // Slate-900
      paper: '#1e293b', // Slate-800
    },
    text: {
      primary: '#f1f5f9', // Slate-100
      secondary: '#94a3b8', // Slate-400
    },
    divider: '#334155', // Slate-700
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(148, 163, 184, 0.1)', // Slate-400 with opacity
          },
        },
      },
    },
  },
});

// Define extended theme interface for custom properties
declare module '@mui/material/styles' {
  interface Theme {
    custom: {
      slyData: {
        keyColor: string;
        valueColor: string;
        emptyColor: string;
        separatorColor: string;
        hoverBackground: string;
        focusBackground: string;
        inputBackground: string;
        borderColor: string;
      };
    };
  }

  interface ThemeOptions {
    custom?: {
      slyData?: {
        keyColor?: string;
        valueColor?: string;
        emptyColor?: string;
        separatorColor?: string;
        hoverBackground?: string;
        focusBackground?: string;
        inputBackground?: string;
        borderColor?: string;
      };
    };
  }
}

// Augment themes with custom SlyData colors
const augmentedLightTheme = createTheme(lightTheme, {
  custom: {
    slyData: {
      keyColor: '#d97706', // Amber-600
      valueColor: '#059669', // Emerald-600
      emptyColor: '#64748b', // Slate-500
      separatorColor: '#94a3b8', // Slate-400
      hoverBackground: '#f1f5f9', // Slate-100
      focusBackground: '#dbeafe', // Blue-100
      inputBackground: '#ffffff',
      borderColor: '#e2e8f0', // Slate-200
    },
  },
});

const augmentedDarkTheme = createTheme(darkTheme, {
  custom: {
    slyData: {
      keyColor: '#fbbf24', // Amber-400
      valueColor: '#34d399', // Emerald-300
      emptyColor: '#94a3b8', // Slate-400
      separatorColor: '#64748b', // Slate-500
      hoverBackground: '#334155', // Slate-700
      focusBackground: '#1e40af', // Blue-800 with opacity
      inputBackground: '#374151', // Gray-700
      borderColor: '#475569', // Slate-600
    },
  },
});

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Check for saved theme preference or default to light mode
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('nsflow-theme-mode');
    return saved ? JSON.parse(saved) : false;
  });

  // Update localStorage when theme changes
  useEffect(() => {
    localStorage.setItem('nsflow-theme-mode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const theme = isDarkMode ? augmentedDarkTheme : augmentedLightTheme;

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, theme }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
