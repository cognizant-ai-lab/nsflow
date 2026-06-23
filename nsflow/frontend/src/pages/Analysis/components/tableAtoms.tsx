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

import { ReactNode } from "react";
import { TableCell, TableRow, useTheme } from "@mui/material";

// Shared cells used by every table on the Analysis page.

export const Th = ({ children, align }: { children: ReactNode; align?: "right" }) => (
  <TableCell
    align={align}
    sx={{ fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}
  >
    {children}
  </TableCell>
);

export const Td = ({ children, align }: { children: ReactNode; align?: "right" }) => (
  <TableCell align={align} sx={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
    {children}
  </TableCell>
);

export const EmptyRow = ({ cols }: { cols: number }) => {
  const theme = useTheme();
  return (
    <TableRow>
      <TableCell
        colSpan={cols}
        sx={{ textAlign: "center", color: theme.palette.text.disabled, py: 3, fontSize: 13 }}
      >
        No data
      </TableCell>
    </TableRow>
  );
};
