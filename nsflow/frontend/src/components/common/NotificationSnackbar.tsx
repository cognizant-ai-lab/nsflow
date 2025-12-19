/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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

import { useEffect, useState, useRef } from 'react';
import { Snackbar, Alert, AlertColor, Box, LinearProgress, alpha } from '@mui/material';
import { styled, keyframes } from '@mui/material/styles';
import {
  SNACKBAR_DURATION,
  SNACKBAR_PROGRESS_INTERVAL,
} from '../../constants/notifications';

export interface SnackbarNotification {
  message: string;
  severity?: AlertColor; // 'success' | 'info' | 'warning' | 'error'
  duration?: number; // in milliseconds, defaults to SNACKBAR_DURATION constant
  autoHide?: boolean; // default true
}

interface NotificationSnackbarProps {
  notification: SnackbarNotification | null;
  onClose: () => void;
}

// Glowing progress bar animations for different severities
const glowSuccess = keyframes`
  0% { box-shadow: 0 0 5px rgba(46, 125, 50, 0.5); }
  50% { box-shadow: 0 0 20px rgba(46, 125, 50, 0.8); }
  100% { box-shadow: 0 0 5px rgba(46, 125, 50, 0.5); }
`;

const glowError = keyframes`
  0% { box-shadow: 0 0 5px rgba(211, 47, 47, 0.5); }
  50% { box-shadow: 0 0 20px rgba(211, 47, 47, 0.8); }
  100% { box-shadow: 0 0 5px rgba(211, 47, 47, 0.5); }
`;

const glowWarning = keyframes`
  0% { box-shadow: 0 0 5px rgba(237, 108, 2, 0.5); }
  50% { box-shadow: 0 0 20px rgba(237, 108, 2, 0.8); }
  100% { box-shadow: 0 0 5px rgba(237, 108, 2, 0.5); }
`;

const glowInfo = keyframes`
  0% { box-shadow: 0 0 5px rgba(2, 136, 209, 0.5); }
  50% { box-shadow: 0 0 20px rgba(2, 136, 209, 0.8); }
  100% { box-shadow: 0 0 5px rgba(2, 136, 209, 0.5); }
`;

const getGlowAnimation = (severity: AlertColor) => {
  switch (severity) {
    case 'success': return glowSuccess;
    case 'error': return glowError;
    case 'warning': return glowWarning;
    case 'info': return glowInfo;
    default: return glowInfo;
  }
};

const GlowingProgress = styled(LinearProgress)<{ severity: AlertColor }>(({ theme, severity }) => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 4,
  backgroundColor: 'transparent',
  borderRadius: '0 0 12px 12px', // Round bottom corners to match Alert
  overflow: 'hidden',
  '& .MuiLinearProgress-bar': {
    backgroundColor:
      severity === 'success' ? alpha(theme.palette.success.light, 0.9) :
      severity === 'error' ? alpha(theme.palette.error.light, 0.9) :
      severity === 'warning' ? alpha(theme.palette.warning.light, 0.9) :
      alpha(theme.palette.info.light, 0.6),
    animation: `${getGlowAnimation(severity)} 1.5s ease-in-out infinite`,
    borderRadius: '0 0 12px 12px', // Also round the progress bar itself
  },
}));

/**
 * Reusable Snackbar component with glowing progress bar
 *
 * Features:
 * - Auto-dismiss with configurable duration (uses SNACKBAR_DURATION by default)
 * - Glowing progress bar showing remaining time (color-coded by severity)
 * - Different severity levels (success, info, warning, error)
 * - Positioned at bottom-right corner
 * - Rounded corners and enhanced shadows for modern look
 *
 * @example
 * ```tsx
 * import { SNACKBAR_DURATION } from '../../constants/notifications';
 *
 * const [notification, setNotification] = useState<SnackbarNotification | null>(null);
 *
 * // Show notification with default duration (5000ms)
 * setNotification({
 *   message: 'Thread deleted successfully',
 *   severity: 'success',
 *   // duration omitted - uses SNACKBAR_DURATION
 * });
 *
 * // Show notification with custom duration
 * setNotification({
 *   message: 'Important message',
 *   severity: 'warning',
 *   duration: SNACKBAR_DURATION * 2 // 10000ms
 * });
 *
 * // Component usage
 * <NotificationSnackbar
 *   notification={notification}
 *   onClose={() => setNotification(null)}
 * />
 * ```
 */
export const NotificationSnackbar: React.FC<NotificationSnackbarProps> = ({
  notification,
  onClose,
}) => {
  const [progress, setProgress] = useState(100);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!notification || notification.autoHide === false) {
      return;
    }

    const duration = notification.duration || SNACKBAR_DURATION;
    const interval = SNACKBAR_PROGRESS_INTERVAL;
    const decrement = (interval / duration) * 100;

    setProgress(100); // Reset progress

    const timer = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev - decrement;
        if (newProgress <= 0) {
          clearInterval(timer);
          // Schedule close in next tick to avoid setState during render
          closeTimeoutRef.current = window.setTimeout(() => {
            onClose();
          }, 0);
          return 0;
        }
        return newProgress;
      });
    }, interval);

    return () => {
      clearInterval(timer);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [notification, onClose]);

  if (!notification) {
    return null;
  }

  const severity = notification.severity || 'info';
  const autoHide = notification.autoHide !== false;

  return (
    <Snackbar
      open={!!notification}
      onClose={(_, reason) => {
        // Prevent closing on clickaway if autoHide is disabled
        if (reason === 'clickaway' && !autoHide) {
          return;
        }
        onClose();
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      sx={{ mb: 2, mr: 2 }}
    >
      <Box sx={{
        position: 'relative',
        minWidth: 320,
        maxWidth: 500,
        borderRadius: 3, // Match Alert border radius
        overflow: 'hidden', // Clip progress bar to rounded corners
      }}>
        <Alert
          onClose={onClose}
          severity={severity}
          variant="filled"
          sx={(theme) => ({
            width: '100%',
            borderRadius: 3, // 12px rounded corners
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1)',
            paddingBottom: autoHide ? '16px' : '12px', // Extra space for progress bar
            backgroundColor:
              severity === 'success' ? alpha(theme.palette.success.main, 0.4) :
              severity === 'error' ? alpha(theme.palette.error.main, 0.4) :
              severity === 'warning' ? alpha(theme.palette.warning.main, 0.4) :
              alpha(theme.palette.info.main, 0.9),
            '& .MuiAlert-message': {
              width: '100%',
              wordBreak: 'break-word',
              fontSize: '0.9rem',
              fontWeight: 500,
            },
            '& .MuiAlert-icon': {
              fontSize: '1.5rem',
            },
            '& .MuiAlert-action': {
              paddingTop: 0,
              alignItems: 'flex-start',
            },
            transition: 'all 0.3s ease-in-out',
          })}
        >
          {notification.message}
        </Alert>
        {autoHide && (
          <GlowingProgress
            variant="determinate"
            value={progress}
            severity={severity}
          />
        )}
      </Box>
    </Snackbar>
  );
};

export default NotificationSnackbar;
