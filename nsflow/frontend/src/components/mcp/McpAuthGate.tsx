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

import React, { useEffect, useRef, useState } from 'react';
import { useApiPort } from '../../context/ApiPortContext';
import { useChatContext } from '../../context/ChatContext';
import { McpAuthRequiredDialog } from './McpAuthRequiredDialog';

/**
 * Renders nothing until a selected network requires MCP servers the user hasn't
 * connected. When the active network changes, it asks the backend which required
 * MCP URLs are unconnected; if any, it shows a dialog telling the user to connect
 * them in the Connectors tab. Acknowledging returns to the nsflow home.
 */
const McpAuthGate: React.FC = () => {
  const { apiUrl, isReady } = useApiPort();
  const { activeNetwork } = useChatContext();

  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [gatedNetwork, setGatedNetwork] = useState('');
  // Avoid re-prompting for a network the user already acknowledged this session.
  const acknowledgedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeNetwork || !isReady || !apiUrl) return;
    if (acknowledgedRef.current.has(activeNetwork)) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/v1/mcp/oauth/required/${encodeURIComponent(activeNetwork)}`);
        if (!res.ok) return;
        const data = await res.json();
        // Ignore a response for a network the user already moved away from.
        if (cancelled || data?.network !== activeNetwork) return;
        const missingUrls: string[] = Array.isArray(data?.missing) ? data.missing : [];
        if (missingUrls.length > 0) {
          setMissing(missingUrls);
          setGatedNetwork(activeNetwork);
          setOpen(true);
        }
      } catch (err) {
        // Never block the user on a check failure.
        console.error('Failed to check MCP auth requirements:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [activeNetwork, isReady, apiUrl]);

  const handleOk = () => {
    // Remember so re-selecting this network (after connecting) doesn't loop.
    if (gatedNetwork) acknowledgedRef.current.add(gatedNetwork);
    setOpen(false);
    // Return to the nsflow home (no network selected) where the Connectors tab
    // is available so the user can authenticate the required server(s). A full
    // navigation cleanly resets all network-dependent views and the acknowledged
    // set, so re-selecting a still-unconnected network prompts again.
    window.location.href = '/home';
  };

  if (!open) return null;
  return (
    <McpAuthRequiredDialog open={open} networkName={gatedNetwork} missing={missing} onOk={handleOk} />
  );
};

export default McpAuthGate;
