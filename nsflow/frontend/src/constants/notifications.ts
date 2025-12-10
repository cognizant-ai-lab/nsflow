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

/**
 * Notification Configuration Constants
 *
 * Centralized configuration for snackbar notifications across the application.
 * Change these values once to affect all notifications globally.
 */

/**
 * Default duration for snackbar notifications (in milliseconds)
 */
export const SNACKBAR_DURATION = 5000;

/**
 * Duration for longer notifications (e.g., errors that need more attention)
 */
export const SNACKBAR_DURATION_LONG = 10000;

/**
 * Duration for quick notifications (e.g., simple confirmations)
 */
export const SNACKBAR_DURATION_SHORT = 2000;

/**
 * Maximum character length for truncated text in notifications
 * @default 20
 */
export const NOTIFICATION_TEXT_TRUNCATE_LENGTH = 20;

/**
 * Progress bar update interval (in milliseconds)
 * Lower values = smoother animation, higher CPU usage
 * @default 50
 */
export const SNACKBAR_PROGRESS_INTERVAL = 50;
