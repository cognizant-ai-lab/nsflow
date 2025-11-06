
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

import { useEffect, useState } from "react";
import { 
  Box, 
  Typography, 
  Paper, 
  Link,
  useTheme,
  alpha
} from "@mui/material";
import { 
  GitHub as GitHubIcon,
  MenuBook as BookIcon,
  Api as ApiIcon
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import SustainabilityScore from "./SustainabilityScore";

const InfoPanel = () => {
  const { apiUrl } = useApiPort();
  const [versions, setVersions] = useState<{ nsflow: string; neuroSan: string }>({
    nsflow: "Loading...",
    neuroSan: "Loading...",
  });
  const theme = useTheme();

  useEffect(() => {
    const fetchVersion = async (packageName: string) => {
      try {
        const response = await fetch(`${apiUrl}/api/v1/version/${packageName}`);
        const data = await response.json();
        return data.version;
      } catch (err) {
        console.error(`Failed to fetch version for ${packageName}:`, err);
        return "Unknown";
      }
    };

    const fetchVersions = async () => {
      const nsflowVersion = await fetchVersion("nsflow");
      const neuroSanVersion = await fetchVersion("neuro-san");

      setVersions({
        nsflow: nsflowVersion,
        neuroSan: neuroSanVersion,
      });
    };

    fetchVersions();
  }, [apiUrl]);

  return (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 1,
        borderBottom: `1px solid ${theme.palette.divider}`,
        pb: 0
      }}>
        <Typography variant="h6" sx={{ 
          color: theme.palette.text.primary,
          fontWeight: 600
        }}>
          Info
        </Typography>
      </Box>

      {/* Sustainability Score Section */}
      <Paper
        variant="outlined"
        sx={{
          overflow: 'auto',
          maxHeight: '18rem',
          minHeight: '8rem',
          p: 1,
          mb: 0.5,
          backgroundColor: alpha(theme.palette.background.default, 0.5),
          border: `1px solid ${theme.palette.divider}`
        }}
      >
        <SustainabilityScore />
      </Paper>

      {/* Resources Section */}
      <Paper
        variant="outlined"
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          maxHeight: '24rem',
          p: 1,
          backgroundColor: alpha(theme.palette.background.default, 0.5),
          border: `1px solid ${theme.palette.divider}`
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{ 
            fontWeight: 600, 
            color: theme.palette.text.secondary,
            mb: 0.5
          }}>
            Resources
          </Typography>
          
          {/* Versions Display */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Link
              href="https://github.com/cognizant-ai-lab/neuro-san"
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: theme.palette.primary.main,
                textDecoration: 'none',
                '&:hover': {
                  color: theme.palette.primary.light,
                  textDecoration: 'underline'
                }
              }}
            >
              <GitHubIcon sx={{ fontSize: 18 }} />
              <Typography variant="body2">
                neuro-san v. {versions.neuroSan}
              </Typography>
            </Link>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Link
              href="https://github.com/cognizant-ai-lab/nsflow"
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: theme.palette.primary.main,
                textDecoration: 'none',
                '&:hover': {
                  color: theme.palette.primary.light,
                  textDecoration: 'underline'
                }
              }}
            >
              <GitHubIcon sx={{ fontSize: 18 }} />
              <Typography variant="body2">
                nsflow v. {versions.nsflow}
              </Typography>
            </Link>
          </Box>

          {/* GitHub Link */}
          <Link
            href="https://github.com/cognizant-ai-lab/neuro-san-studio"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: theme.palette.primary.main,
              textDecoration: 'none',
              '&:hover': {
                color: theme.palette.primary.light,
                textDecoration: 'underline'
              }
            }}
          >
            <GitHubIcon sx={{ fontSize: 18 }} />
            <Typography variant="body2">
              neuro-san-studio
            </Typography>
          </Link>

          {/* FastAPI Docs Link */}
          <Link
            href={`${apiUrl}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: theme.palette.primary.main,
              textDecoration: 'none',
              '&:hover': {
                color: theme.palette.primary.light,
                textDecoration: 'underline'
              }
            }}
          >
            <ApiIcon sx={{ fontSize: 18 }} />
            <Typography variant="body2">
              FastAPI Specs
            </Typography>
          </Link>

          {/* Documentation and User Guide */}
          <Link
            href="https://github.com/cognizant-ai-lab/neuro-san-studio/blob/main/README.md"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: theme.palette.primary.main,
              textDecoration: 'none',
              '&:hover': {
                color: theme.palette.primary.light,
                textDecoration: 'underline'
              }
            }}
          >
            <BookIcon sx={{ fontSize: 18 }} />
            <Typography variant="body2">
              Examples and User Guide
            </Typography>
          </Link>
        </Box>
      </Paper>
    </Paper>
  );
};

export default InfoPanel;
