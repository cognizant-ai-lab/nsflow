import { useEffect, useState, useRef } from "react";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";
import { useChatControls } from "../hooks/useChatControls";

const Sidebar = ({ onSelectNetwork }: { onSelectNetwork: (network: string) => void }) => {
  const [networks, setNetworks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { apiPort, setApiPort } = useApiPort(); // Access API port from context
  const { activeNetwork, setActiveNetwork } = useChatContext(); 
  const { stopWebSocket, clearChat } = useChatControls();
  const [tempPort, setTempPort] = useState(apiPort);
  const networksEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to latest network
    networksEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [networks]);

  useEffect(() => {
    setTempPort(apiPort);
  }, [apiPort]);

  useEffect(() => {
    const fetchNetworks = async () => {
      setLoading(true);
      setError(""); // Reset error
      try {
        const response = await fetch(`http://127.0.0.1:${apiPort}/api/v1/networks/`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        setNetworks(data.networks);
      } catch (err) {
        setError(`Failed to load agent networks. ${err}`);
      } finally {
        setLoading(false);
      }
    };

    fetchNetworks();
  }, [apiPort]);

  const handleNetworkSelection = (network: string) => {
    if (network === activeNetwork) return; // Prevent unnecessary reloading

    console.log(`Switching to network: ${network}`);

    stopWebSocket();  // Close current WebSocket connections
    clearChat();      // Reset chat history
    setActiveNetwork(network); // Set new active network
    onSelectNetwork(network);
  };

  return (
    <aside className="h-full sidebar p-4 flex flex-col gap-3 border-r">
      <h2 className="text-lg font-bold">Agent Networks</h2>

      {/* API Port Input */}
      <div className="mb-2 p-2 bg-gray-800 rounded">
        <label className="text-sm text-gray-300">API Port:</label>
        <input
          type="number"
          min="1024"
          max="65535"
          value={tempPort}
          onChange={(e) => setTempPort(Number(e.target.value))}
          className="w-full bg-gray-700 text-white p-1 rounded mt-1"
        />
        <button
          onClick={() => setApiPort(tempPort)}
          className="w-full mt-2 p-1 bg-blue-500 hover:bg-blue-500 text-white rounded"
        >
          Connect
        </button>
      </div>

      
      {/* Scrollable networks container */}
      <div className="flex-grow overflow-y-auto p-0 space-y-1 bg-gray-900 max-h-[70vh]">
        {loading && <p>Loading...</p>}
        {error && <p className="text-red-500">{error}</p>}
        {networks.map((network) => (
          <div key={network} className="relative p-1 rounded-md text-sm text-gray-100">
            <button
              className={`w-full text-left p-1 text-sm rounded cursor-pointer transition-all 
                ${
                  activeNetwork === network
                    ? "bg-orange-400 text-white font-bold" // Highlight active network
                    : "bg-blue-700 hover:bg-blue-600"
                }`}
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
