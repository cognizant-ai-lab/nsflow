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
import { Box, Typography, useTheme } from "@mui/material";

// Labelled wrapper for a single filter control (date picker, select).
const FilterField = ({ label, children }: { label: string; children: ReactNode }) => {
  const theme = useTheme();
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ display: "block", color: theme.palette.text.secondary, mb: 0.5 }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
};

export default FilterField;
