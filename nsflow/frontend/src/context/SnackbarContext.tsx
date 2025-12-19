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

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { NotificationSnackbar, SnackbarNotification } from '../components/common/NotificationSnackbar';

interface SnackbarContextType {
  showSnackbar: (notification: SnackbarNotification) => void;
  hideSnackbar: () => void;
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

interface SnackbarProviderProps {
  children: ReactNode;
}

/**
 * Provider component for global snackbar notifications
 *
 * Wrap your app with this provider to enable snackbar notifications
 * from any component using the useSnackbar hook.
 *
 * @example
 * ```tsx
 * <SnackbarProvider>
 *   <App />
 * </SnackbarProvider>
 * ```
 */
export const SnackbarProvider: React.FC<SnackbarProviderProps> = ({ children }) => {
  const [notification, setNotification] = useState<SnackbarNotification | null>(null);

  const showSnackbar = useCallback((notif: SnackbarNotification) => {
    setNotification(notif);
  }, []);

  const hideSnackbar = useCallback(() => {
    setNotification(null);
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar, hideSnackbar }}>
      {children}
      <NotificationSnackbar notification={notification} onClose={hideSnackbar} />
    </SnackbarContext.Provider>
  );
};

/**
 * Hook to access snackbar notification functions
 *
 * @returns Object with showSnackbar and hideSnackbar functions
 *
 * @example
 * ```tsx
 * import { useSnackbar } from '../context/SnackbarContext';
 * import { SNACKBAR_DURATION, SNACKBAR_DURATION_LONG, SNACKBAR_DURATION_SHORT } from '../constants/notifications';
 *
 * const { showSnackbar } = useSnackbar();
 *
 * // Show success notification with default duration
 * showSnackbar({
 *   message: 'Operation completed successfully',
 *   severity: 'success',
 *   // duration omitted - uses SNACKBAR_DURATION (5000ms)
 * });
 *
 * // Show error notification with longer duration
 * showSnackbar({
 *   message: 'Something went wrong',
 *   severity: 'error',
 *   duration: SNACKBAR_DURATION_LONG // 10000ms
 * });
 *
 * // Show quick confirmation
 * showSnackbar({
 *   message: 'Saved!',
 *   severity: 'success',
 *   duration: SNACKBAR_DURATION_SHORT // 2000ms
 * });
 *
 * // Show persistent notification (no auto-hide)
 * showSnackbar({
 *   message: 'Important: Please review',
 *   severity: 'warning',
 *   autoHide: false
 * });
 * ```
 */
export const useSnackbar = (): SnackbarContextType => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
};
