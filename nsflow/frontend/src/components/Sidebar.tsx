
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
  const { apiUrl, isReady } = useApiPort();
  const { activeNetwork, setActiveNetwork } = useChatContext();
  const { stopWebSocket, clearChat } = useChatControls();
  const networksEndRef = useRef<HTMLDivElement>(null);
  const { host, port, connectionType, setHost, setPort, setConnectionType, isNsReady } = useNeuroSan();

  const [tempHost, setTempHost] = useState(host);
  const [tempPort, setTempPort] = useState<number | undefined>(port);
  const [tempConnectionType, setTempConnectionType] = useState<string>("grpc");
  const [initialized, setInitialized] = useState(false);

  // Sync tempHost/tempPort when host/port from context change (after get_ns_config)
  useEffect(() => {
    if (host && host.trim() !== "") {
      setTempHost(host);
    }
    if (port && typeof port === "number") {
      setTempPort(port);
    }
    if (connectionType?.trim()) setTempConnectionType(connectionType);
    console.log(">>>> NeuroSanContext config updated:", { host, port, connectionType });
  }, [host, port, connectionType]);


  useEffect(() => {
    networksEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [networks]);

  // Initial connect only once if host and port exist
  useEffect(() => {
    if (!initialized && isReady && isNsReady && host?.trim() !== "" && port && apiUrl) {
      setInitialized(true);
      handleNeurosanConnect(connectionType, host, port, false); // skip setConfig on first load
    }
  }, [isReady, isNsReady, apiUrl, host, port]);

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

  const fetchNetworks = useCallback(async (connectionToUse: string, hostToUse: string, portToUse: number) => {
    console.log(">>>> Calling /list with", connectionToUse, hostToUse, portToUse);
    setLoading(true);
    setError("");
    try {
      const response = await fetchWithTimeout(
        `${apiUrl}/api/v1/list?connection_type=${connectionToUse}&host=${encodeURIComponent(hostToUse)}&port=${portToUse}`,
        { method: "GET", headers: { "Content-Type": "application/json" } },
        30000
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to connect: ${response.statusText} - ${text}`);
      }

      const data = await response.json();
      const agentNames = data.agents?.map((a: { agent_name: string }) => a.agent_name);
      setNetworks(agentNames || []);
    } catch (err: any) {
      const message = err.name === "AbortError"
        ? "[x] Connection timed out. Check if the server is up and running."
        : `[x] Connection failed. Check NeuroSan server. \n\n${err.message}`;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  const setConfig = async (hostToUse: string, portToUse: number, typeToUse: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/set_ns_config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          NEURO_SAN_SERVER_HOST: hostToUse,
          NEURO_SAN_SERVER_PORT: portToUse,
          NEURO_SAN_CONNECTION_TYPE: typeToUse 
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      console.log(`>>>> Config via fastapi port:${apiUrl} set to use NeuroSan server:", ${data}`);
    } catch (error) {
      console.error("[x] Failed to set config:", error);
    }
  };

  const handleNeurosanConnect = async (newType?: string, newHost?: string, newPort?: number, updateConfig = true) => {
    const finalHost = newHost ?? tempHost;
    const finalPort = newPort ?? tempPort;
    const finalType = newType ?? tempConnectionType;

    console.log(`>>>Connecting to ${finalType}::/${finalHost}:${finalPort}`)

    if (!finalHost || !finalPort) {
      setError("[x] Please enter valid host and port.");
      return;
    }

    setNetworks([]);
    setError("");
    setLoading(true);

    try {
      if (updateConfig) {
        setHost(finalHost);
        setPort(finalPort);
        setConnectionType(finalType);
        await setConfig(finalHost, finalPort, finalType);
      }
      await fetchNetworks(finalType, finalHost, finalPort);
    } catch (error) {
      setError("Failed to connect to NeuroSan server.");
    } finally {
      setLoading(false);
    }
  };

  const handleNetworkSelection = (network: string) => {
    if (network === activeNetwork) return;
    stopWebSocket();
    clearChat();
    setActiveNetwork(network);
    onSelectNetwork(network);
  };

  return (
    <aside className="sidebar h-full sidebar p-4 flex flex-col gap-3 border-r">
      <span className="text-lg font-bold sidebar-text-large">Agent Networks</span>

      {/* NeuroSan Host/Port Section */}
      <div className="sidebar-api-input p-2 bg-gray-800 rounded sidebar-text">
        <label className="sidebar-text block mb-1">Type:</label>
          <div className="flex flex-wrap gap-1 mb-1 text-white">
            {["grpc", "http", "https"].map((type) => (
              <label key={type} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="connectionType"
                  value={type}
                  checked={tempConnectionType === type}
                  onChange={() => setTempConnectionType(type)}
                />
                {type}
              </label>
            ))}
          </div>
        <label className="sidebar-text">NeuroSan Host:</label>
        <input
          type="text"
          value={tempHost ?? ""}
          onChange={(e) => setTempHost(e.target.value)}
          className="w-full bg-gray-500 text-white p-1 rounded mt-1 sidebar-text"
        />

        <label className="sidebar-text mt-2 block">NeuroSan Port:</label>
        <input
          type="number"
          min="1024"
          max="65535"
          value={tempPort !== undefined ? tempPort : ""}
          onChange={(e) => {
            const val = e.target.value;
            setTempPort(val === "" ? undefined : Number(val));
          }}
          className="w-full bg-gray-500 text-white p-1 rounded mt-1 sidebar-text"
        />

        <button
          onClick={() => handleNeurosanConnect(tempConnectionType, tempHost, tempPort, true)}
          className="w-full mt-2 p-1 bg-green-600 hover:bg-green-700 text-white rounded sidebar-text"
        >
          Connect
        </button>
      </div>

      {/* Networks Display */}
      <div className="sidebar-api-input flex-grow overflow-y-auto p-0 space-y-1 bg-gray-900 max-h-[70vh]">
        {loading && <p className="sidebar-text-large">Loading...</p>}
        {error && <p className="text-red-500">{error.split('\n').map((line, idx) => (
          <span key={idx}>
            {line}
            <br />
          </span>
        ))}</p>}
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
        <div ref={networksEndRef} />
      </div>
    </aside>
  );
};

export default Sidebar;
