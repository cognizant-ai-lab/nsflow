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

// Filter-state helpers for the Analysis page (date input <-> epoch seconds).

export const ALL = "__all__";

const DEFAULT_RANGE_DAYS = 7;

export const toDateInput = (epochSeconds: number | null): string => {
  if (epochSeconds == null) return "";
  const d = new Date(epochSeconds * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// endOfDay biases the time to 23:59:59 so "until" filters include the chosen day.
// Parses the YYYY-MM-DD parts into a local Date to avoid the UTC interpretation
// new Date(string) applies, which would shift the day for non-UTC users.
export const fromDateInput = (value: string, endOfDay = false): number | null => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, day] = match;
  const year = Number(y);
  const month = Number(m) - 1;
  const date = Number(day);
  const d = endOfDay
    ? new Date(year, month, date, 23, 59, 59, 999)
    : new Date(year, month, date, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
};

export const defaultSince = (days: number = DEFAULT_RANGE_DAYS): number =>
  Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
