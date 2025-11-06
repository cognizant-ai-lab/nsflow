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

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  useTheme,
  alpha
} from '@mui/material';
import { useApiPort } from '../context/ApiPortContext';
import { useChatContext } from '../context/ChatContext';

interface SustainabilityValues {
  energy: string;
  carbon: string;
  water: string;
  model: string;
  cost: string;
}

// Static metrics array to prevent recreation on every render
const SUSTAINABILITY_METRICS = [
  { icon: '⚡', label: 'Energy', key: 'energy' as keyof SustainabilityValues },
  { icon: '🌍', label: 'Carbon', key: 'carbon' as keyof SustainabilityValues },
  { icon: '💧', label: 'Water', key: 'water' as keyof SustainabilityValues },
  { icon: '💰', label: 'Cost', key: 'cost' as keyof SustainabilityValues }
] as const;

const SustainabilityScore: React.FC = () => {
  const [values, setValues] = useState<SustainabilityValues>({
    energy: '0.17 kWh',
    carbon: '80 g CO₂',
    water: '0.23 L',
    model: 'GPT-4',
    cost: '$0.003'
  });

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { wsUrl } = useApiPort();
  const { activeNetwork } = useChatContext();
  const theme = useTheme();

  const sustainabilityWsUrl = useMemo(() => 
    wsUrl && activeNetwork ? `${wsUrl}/api/v1/ws/sustainability/${activeNetwork}` : null,
    [wsUrl, activeNetwork]
  );

  useEffect(() => {
    // Fallback static data
    const fallbackData = {
      energy: "0.00 kWh",
      carbon: "00 g CO₂", 
      water: "0.00 L",
      model: "-",
      cost: "$0.000"
    };

    if (!sustainabilityWsUrl) {
      setConnectionStatus('disconnected');
      setLoading(false);
      setError(null);
      setValues(fallbackData);
      return;
    }

    setConnectionStatus('connecting');
    setLoading(true);
    setError(null);

    let ws: WebSocket | null = null;
    let isCleanedUp = false;
    let connectionTimeout: NodeJS.Timeout;
    let fallbackTimeout: NodeJS.Timeout;

    // Fail-safe: Use fallback data after 5 seconds if WebSocket fails
    fallbackTimeout = setTimeout(() => {
      if (!isCleanedUp && connectionStatus !== 'connected') {
        setValues(fallbackData);
        setLoading(false);
        setConnectionStatus('disconnected');
      }
    }, 5000);

    const attemptConnection = () => {
      if (isCleanedUp) return;

      try {
        ws = new WebSocket(sustainabilityWsUrl);

        connectionTimeout = setTimeout(() => {
          if (ws && ws.readyState === WebSocket.CONNECTING) {
            ws.close();
            if (!isCleanedUp) {
              setValues(fallbackData);
              setLoading(false);
              setConnectionStatus('disconnected');
            }
          }
        }, 3000);

        ws.onmessage = (event) => {
          if (isCleanedUp) return;
          clearTimeout(connectionTimeout);
          clearTimeout(fallbackTimeout);
          try {
            const data = JSON.parse(event.data);
            setValues(data);
            setLoading(false);
            setConnectionStatus('connected');
          } catch (err) {
            // Use fallback data on parse error
            setValues(fallbackData);
            setLoading(false);
            setConnectionStatus('disconnected');
          }
        };

        ws.onopen = () => {
          if (isCleanedUp) return;
          clearTimeout(connectionTimeout);
          // Don't clear fallback timeout yet - wait for actual data
        };

        ws.onclose = () => {
          if (isCleanedUp) return;
          clearTimeout(connectionTimeout);
          setConnectionStatus('disconnected');
          setLoading(false);
        };

        ws.onerror = () => {
          if (isCleanedUp) return;
          clearTimeout(connectionTimeout);
          clearTimeout(fallbackTimeout);
          // Silent failure - use fallback data
          setValues(fallbackData);
          setConnectionStatus('disconnected');
          setLoading(false);
        };
      } catch (err) {
        if (!isCleanedUp) {
          setValues(fallbackData);
          setLoading(false);
          setConnectionStatus('disconnected');
        }
      }
    };

    // Delay connection to prevent chat interference
    const initialDelay = setTimeout(attemptConnection, 100);

    return () => {
      isCleanedUp = true;
      clearTimeout(initialDelay);
      if (connectionTimeout) clearTimeout(connectionTimeout);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (ws) {
        try {
          if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
            ws.close(1000, 'Component unmounted');
          }
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    };
  }, [sustainabilityWsUrl, activeNetwork]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {/* Compact Header */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between' 
      }}>
        <Typography variant="subtitle2" sx={{ 
          fontWeight: 600, 
          color: theme.palette.text.primary,
          fontSize: '0.8rem'
        }}>
          Sustainability Score
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {connectionStatus === 'connected' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ 
                width: 6, 
                height: 6, 
                backgroundColor: theme.palette.success.main,
                borderRadius: '50%',
                animation: 'pulse 2s infinite'
              }} />
              <Typography variant="caption" sx={{ 
                color: theme.palette.text.secondary,
                fontSize: '0.65rem'
              }}>
                Live
              </Typography>
            </Box>
          )}
          {loading && (
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.secondary,
              fontSize: '0.65rem'
            }}>
              Loading...
            </Typography>
          )}
          {error && (
            <Typography variant="caption" sx={{ 
              color: theme.palette.error.main,
              fontSize: '0.65rem'
            }} title={error}>
              Error
            </Typography>
          )}
        </Box>
      </Box>
      
      {/* Compact Metrics Grid */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          backgroundColor: alpha(theme.palette.background.default, 0.5),
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1
        }}
      >
        <Box sx={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1
        }}>
          {SUSTAINABILITY_METRICS.map((metric) => (
            <Box key={metric.key} sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <Box sx={{ 
                fontSize: '1rem',
                mb: 0.25,
                '&:hover': {
                  transform: 'scale(1.1)'
                },
                transition: 'transform 0.2s ease'
              }}>
                {metric.icon}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.125 }}>
                <Typography variant="caption" sx={{ 
                  fontSize: '0.6rem',
                  fontWeight: 500,
                  color: theme.palette.text.secondary,
                  lineHeight: 1
                }}>
                  {metric.label}
                </Typography>
                <Typography variant="caption" sx={{ 
                  fontSize: '0.625rem',
                  fontWeight: 600,
                  color: theme.palette.text.primary,
                  lineHeight: 1
                }}>
                  {values[metric.key]}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
};

export default SustainabilityScore;
