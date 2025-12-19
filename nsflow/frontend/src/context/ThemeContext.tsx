/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
© 
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import * as React from 'react';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider, Theme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { githubDarkTheme, githubLightTheme, type ThemeInput } from 'json-edit-react';
import { useMemo } from 'react';

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
      primary: '#0f172a', // Slate-900 (darker for better contrast)
      secondary: '#475569', // Slate-600 (darker secondary)
      disabled: '#94a3b8', // Slate-400 (darker disabled
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
      primary: '#f8fafc', // Slate-50 (lighter for better contrast)
      secondary: '#cbd5e1', // Slate-300 (lighter secondary)
      disabled: '#64748b', // Slate-500 (lighter disabled)
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
        editIconColor: string;
        addIconColor: string;
        deleteIconColor: string;
        labelHoverBackground: string;
      };
      agentNode: {
        activeBg: string;
        inactiveBg: string;
        activeBorder: string;
        inactiveBorder: string;
        titleActiveBg: string;
        titleInactiveBg: string;
        glowColor: string;
      };
    };
    pageVariants: {
      home: { headerBg: string };
      editor: { headerBg: string };
    };
    navButton: {
      active: {
        backgroundColor: string;
        color: string;
        fontWeight: number;
        borderWidth: string;
      };
      inactive: {
        backgroundColor: string;
        color: string;
        fontWeight: number;
        borderWidth: string;
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
        editIconColor?: string;
        addIconColor?: string;
        deleteIconColor?: string;
        labelHoverBackground?: string;
      };
      agentNode?: {
        activeBg?: string;
        inactiveBg?: string;
        activeBorder?: string;
        inactiveBorder?: string;
        titleActiveBg?: string;
        titleInactiveBg?: string;
        glowColor?: string;
      };
    };
    pageVariants?: {
      home?: { headerBg?: string };
      editor?: { headerBg?: string };
    };
    navButton?: {
      active?: {
        backgroundColor?: string;
        color?: string;
        fontWeight?: number;
        borderWidth?: string;
      };
      inactive?: {
        backgroundColor?: string;
        color?: string;
        fontWeight?: number;
        borderWidth?: string;
      };
    };
  }
}

// Augment themes with custom SlyData colors
const augmentedLightTheme = createTheme(lightTheme, {
  custom: {
    slyData: {
      keyColor: '#b45309', // Amber-700 (darker for better contrast)
      valueColor: '#047857', // Emerald-700 (darker for better contrast)
      emptyColor: '#475569', // Slate-600 (darker)
      separatorColor: '#64748b', // Slate-500 (darker)
      hoverBackground: '#f1f5f9', // Slate-100
      focusBackground: '#dbeafe', // Blue-100
      inputBackground: '#ffffff',
      borderColor: '#d1d5db', // Gray-300 (slightly darker border)
      editIconColor: '#2563eb', // Blue-600
      addIconColor: '#10b981', // Emerald-500
      deleteIconColor: '#ef4444', // Red-500
      labelHoverBackground: '#f8fafc', // Slate-50
    },
    agentNode: {
      activeBg: '#facd18ff', // Light amber background
      inactiveBg: '#3b82f6', // Slate-100
      activeBorder: '#ffe99fff', // Amber-500
      inactiveBorder: '#475569', // Slate-300
      titleActiveBg: '#fbbf24', // Amber-400
      titleInactiveBg: '#0ea5e9', // Sky-500
      glowColor: 'rgba(245, 158, 11, 0.6)', // Amber glow
    },
  },
  pageVariants: {
      home: {
        headerBg: '#e0f2fe', // Light blue-100
      },
      editor: {
        headerBg: '#fef9c3', // Amber-100
      },
    },
  navButton: {
    active: {
      backgroundColor: '#10b981', // Emerald-500
      color: '#ffffff',
      fontWeight: 700,
      borderWidth: '2px',
    },
    inactive: {
      backgroundColor: 'transparent',
      color: '#0f172a', // text.primary
      fontWeight: 500,
      borderWidth: '1px',
    },
  },
});

const augmentedDarkTheme = createTheme(darkTheme, {
  custom: {
    slyData: {
      keyColor: '#fcd34d', // Amber-300 (lighter for better contrast)
      valueColor: '#6ee7b7', // Emerald-200 (lighter for better contrast)
      emptyColor: '#cbd5e1', // Slate-300 (lighter)
      separatorColor: '#94a3b8', // Slate-400 (lighter)
      hoverBackground: '#334155', // Slate-700
      focusBackground: '#1e40af', // Blue-800
      inputBackground: '#374151', // Gray-700
      borderColor: '#475569', // Slate-600
      editIconColor: '#60a5fa', // Blue-400
      addIconColor: '#34d399', // Emerald-400
      deleteIconColor: '#f87171', // Red-400
      labelHoverBackground: '#1e293b', // Slate-800
    },
    agentNode: {
      activeBg: '#facd18ff', // Deep amber-900
      inactiveBg: '#3b82f6', // Slate-800
      activeBorder: '#ffe99fff', // Amber-300
      inactiveBorder: '#cbd5e1', // Slate-600
      titleActiveBg: '#b45309', // Amber-700
      titleInactiveBg: '#1e3a8a', // Blue-900
      glowColor: 'rgba(252, 211, 77, 0.6)', // Amber-300 glow
    },
  },
  pageVariants: {
      home: {
        headerBg: '#1e293b', // Slate-800
      },
      editor: {
        headerBg: '#3f3f46', // 3f3f46=Zinc-700, '#3a2e16' // dark depp amber //'#5b4519' // bright deep amber
      },
    },
  navButton: {
    active: {
      backgroundColor: '#34d399', // Emerald-400 (lighter for dark mode)
      color: '#0f172a',
      fontWeight: 700,
      borderWidth: '2px',
    },
    inactive: {
      backgroundColor: 'transparent',
      color: '#f8fafc', // text.primary
      fontWeight: 500,
      borderWidth: '1px',
    },
  },
});

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const buildJsonEditorTheme = (muiTheme: Theme): ThemeInput[] => {
  const base = muiTheme.palette.mode === 'dark' ? githubDarkTheme : githubLightTheme;

  return [
    base,
    {
      styles: {
        // container & base text
        container: {
          backgroundColor: muiTheme.palette.background.paper,
          color: muiTheme.palette.text.primary,
          fontFamily: muiTheme.typography.fontFamily,
        },

        // tokens
        property: muiTheme.palette.text.primary,
        bracket: { color: muiTheme.palette.text.secondary, fontWeight: 700 },

        string: muiTheme.palette.success.main,
        number: muiTheme.palette.info.main,
        boolean: muiTheme.palette.warning.main,
        null: { color: muiTheme.palette.error.main, fontWeight: 'bold' },

        // inputs & highlight
        input: [
          muiTheme.palette.text.primary,
          { backgroundColor: muiTheme.palette.background.default },
        ],
        inputHighlight: muiTheme.palette.action.hover,

        // errors
        error: { color: muiTheme.palette.error.main, fontWeight: 'bold' },

        // icon colors (used by built-in icons)
        iconCollection: muiTheme.palette.primary.main,
        iconEdit: muiTheme.palette.text.secondary,
        iconDelete: muiTheme.palette.error.main,
        iconAdd: muiTheme.palette.primary.main,
        iconCopy: muiTheme.palette.info.main,
        iconOk: muiTheme.palette.success.main,
        iconCancel: muiTheme.palette.warning.main,
      },
    },
  ];
};

export const useJsonEditorTheme = (): ThemeInput[] => {
  const { theme } = useTheme();
  // Recompute when palette mode or the theme object changes
  return useMemo(() => buildJsonEditorTheme(theme), [theme, theme.palette.mode]);
};

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

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }: ThemeProviderProps) => {
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
