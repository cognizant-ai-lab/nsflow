import React, { useState, useEffect, useMemo } from 'react';
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
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="font-bold" style={{ color: 'var(--text-color)' }}>
          Sustainability Score
        </p>
        <div className="flex items-center gap-2">
          {connectionStatus === 'connected' && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-xs" style={{ color: 'var(--text-color-secondary)' }}>Live</span>
            </div>
          )}
          {loading && (
            <div className="text-xs" style={{ color: 'var(--text-color-secondary)' }}>
              Loading...
            </div>
          )}
          {error && (
            <div className="text-xs text-red-400" title={error}>
              Error
            </div>
          )}
        </div>
      </div>
      
      <div 
        className="grid grid-cols-4 gap-2 p-2 rounded-lg"
        style={{ 
          backgroundColor: 'var(--config-input-bg)',
          border: '1px solid var(--border-color)'
        }}
      >
        {SUSTAINABILITY_METRICS.map((metric) => (
          <div key={metric.key} className="flex flex-col items-center">
            <div 
              className="text-xl mb-1 hover:scale-110 transition-transform"
            
            >
              {metric.icon}
            </div>
            <div className="space-y-1">
              <div 
                className="text-xs font-medium" 
                style={{ color: 'var(--text-color-secondary)' }}
              >
                {metric.label}
              </div>
              <div 
                className="text-xs font-semibold" 
                style={{ color: 'var(--text-color)' }}
              >
                {values[metric.key]}
              </div>
            </div>
          </div>
        ))}
      </div>
      
 
    </div>
  );
};

export default SustainabilityScore;
