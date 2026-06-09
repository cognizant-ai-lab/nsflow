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

import { Box, alpha, useTheme } from "@mui/material";

// Inline percentage bar used in the "% of total" column.
const PctBar = ({ value }: { value: number }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "flex-end" }}>
      <Box
        sx={{
          width: 80,
          height: 6,
          borderRadius: 1,
          backgroundColor: alpha(theme.palette.text.secondary, 0.15),
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            width: `${Math.min(Math.max(value, 0), 100)}%`,
            backgroundColor: theme.palette.primary.main,
          }}
        />
      </Box>
      <Box sx={{ width: 50, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {value.toFixed(1)}%
      </Box>
    </Box>
  );
};

export default PctBar;
