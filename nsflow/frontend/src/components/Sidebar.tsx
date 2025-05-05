
// Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
// All Rights Reserved.
// Issued under the Academic Public License.
//
// You can be released from the terms, and requirements of the Academic Public
// License by purchasing a commercial license.
// Purchase of a commercial license is mandatory for any use of the
// nsflow SDK Software in commercial settings.
//
// END COPYRIGHT
import { useEffect, useState, useRef, useCallback } from "react";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { useChatControls } from "../hooks/useChatControls";
import { useNeuroSan } from "../context/NeuroSanContext";

const Sidebar = ({ onSelectNetwork }: { onSelectNetwork: (network: string) => void }) => {
  const [networks, setNetworks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { apiPort, isReady } = useApiPort(); // Access API port from context
  const { activeNetwork, setActiveNetwork } = useChatContext(); 
  const { stopWebSocket, clearChat } = useChatControls();
  // const [tempPort, setTempPort] = useState(apiPort);
  const networksEndRef = useRef<HTMLDivElement>(null);
  const { host, port, setHost, setPort, isNsReady } = useNeuroSan();


  useEffect(() => {
    // Auto-scroll to latest network
    networksEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [networks]);

  const [initialized, setInitialized] = useState(false);
  const [shouldUpdateConfig, setShouldUpdateConfig] = useState(false);

  useEffect(() => {
    if (!initialized && isReady && isNsReady && host && port && apiPort) {
      handleNeurosanConnect();
      setInitialized(true);
    }
  }, [isReady, isNsReady, apiPort, host, port]);

  // Reusable network fetcher
  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 30000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  };
  
  const fetchNetworks = useCallback(async () => {
    console.log(">>>> Using FastapiPort:", apiPort);
    setLoading(true);
    setError("");
    try {
      const response = await fetchWithTimeout(
        `http://localhost:${apiPort}/api/v1/list?host=${encodeURIComponent(host)}&port=${port}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
        30000 // 30 seconds timeout
      );
  
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to connect: ${response.statusText} - ${text}`);
      }
  
      const data = await response.json();
      console.log("Fetched agent networks:", data);
  
      if (data?.agents) {
        const agentNames = data.agents.map((agent: { agent_name: string }) => agent.agent_name);
        setNetworks(agentNames);
      } else {
        throw new Error("Invalid response format from NeuroSan");
      }
    } catch (err: any) {
      const message = err.name === "AbortError"
        ? "[x] Connection to NeuroSan server timed out. Please check the server status."
        : `[x] Connection failed. ${err.message}`;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [apiPort, host, port]);
  

  const setConfig = async () => {
    // Optional: replace or fetch this securely if auth is needed later
    // const token = localStorage.getItem("authToken") || "dummy";
  
    try {
      const response = await fetch(`http://localhost:${apiPort}/api/v1/set_ns_config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          NS_SERVER_HOST: host,
          NS_SERVER_PORT: port
        })
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to connect: ${response.status} - ${errorText}`);
      }
  
      const data = await response.json();
      console.log(`>>>> Config via fastapi port:${apiPort} set to use NeuroSan server:", ${data.message}, ${data.config}`);
    } catch (error) {
      console.error(">>>> Failed to set config:", error);
    }
  };
  
  const handleNeurosanConnect = async () => {
    // Clear current networks to avoid stale display
    setNetworks([]);
    setError(""); // Also reset any old error messages
    setLoading(true); // Show loading indicator while connecting

    try {
      if (shouldUpdateConfig) {
        await setConfig(); // Only update server config if user made changes
        setShouldUpdateConfig(false); // Reset flag after setting config
      }
      await fetchNetworks();   // Fetch fresh list from the new host/port
    } catch (error) {
      console.error("Error during NeuroSan connection setup:", error);
      setError("Failed to connect to NeuroSan server.");
    } finally {
      setLoading(false); // Ensure loading state resets even on error
    }
  };

  const handleNetworkSelection = (network: string) => {
    if (network === activeNetwork) return; // Prevent unnecessary reloading

    console.log(`Switching to network: ${network}`);

    stopWebSocket();  // Close current WebSocket connections
    clearChat();      // Reset chat history
    setActiveNetwork(network); // Set new active network
    onSelectNetwork(network);
  };

  return (
    <aside className="sidebar h-full sidebar p-4 flex flex-col gap-3 border-r">
      <span className="text-lg font-bold sidebar-text-large">Agent Networks</span>

      {/* NeuroSan Host and Port */}
      <div className="sidebar-api-input p-2 bg-gray-800 rounded sidebar-text">
        <label className="sidebar-text">NeuroSan Host:</label>
        <input
          type="text"
          value={host}
          onChange={(e) => {
            setHost(e.target.value);
            setShouldUpdateConfig(true); // Mark config used
          }}
          className="w-full bg-gray-500 text-white p-1 rounded mt-1 sidebar-text"
        />

        <label className="sidebar-text mt-2 block">NeuroSan Port:</label>
        <input
          type="number"
          min="1024"
          max="65535"
          value={port}
          onChange={(e) => {
            setPort(Number(e.target.value));
            setShouldUpdateConfig(true); // Mark config used
          }}
          className="w-full bg-gray-500 text-white p-1 rounded mt-1 sidebar-text"
        />
        <button
          onClick={handleNeurosanConnect}
          className="w-full mt-2 p-1 bg-green-600 hover:bg-green-700 text-white rounded sidebar-text"
        >
          Connect
        </button>
      </div>

      
      {/* Scrollable networks container */}
      <div className="sidebar-api-input flex-grow overflow-y-auto p-0 space-y-1 bg-gray-900 max-h-[70vh]">
        {loading && <p className="sidebar-text-large">Loading...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {networks.map((network) => (
          <div key={network} className="relative p-1 rounded-md text-sm text-gray-100 sidebar-text">
            <button
              className={`sidebar-btn w-full text-left p-1 text-sm rounded cursor-pointer transition-all sidebar-text
                ${activeNetwork === network ? "active-network" : ""}`}
              onClick={() => handleNetworkSelection(network)}
            >
              {network}
            </button>
          </div>
        ))}
        <div ref={networksEndRef} /> {/* Auto-scroll reference */}
      </div>
    </aside>
  );
};

export default Sidebar;
