import { useEffect, useState } from "react";
import { useApiPort } from "../context/ApiPortContext";
import { useChatContext } from "../context/ChatContext";

const Sidebar = ({ onSelectNetwork }: { onSelectNetwork: (network: string) => void }) => {
  const [networks, setNetworks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { apiPort, setApiPort } = useApiPort(); // Access API port from context
  const { setActiveNetwork } = useChatContext(); // For both chat and internal chat
  const [tempPort, setTempPort] = useState(apiPort);

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
    onSelectNetwork(network);
    setActiveNetwork(network); // Ensure both WebSockets start automatically
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
          className="w-full mt-2 p-1 bg-blue-600 hover:bg-blue-500 text-white rounded"
        >
          Connect
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {networks.map((network) => (
        <button
          key={network}
          className="p-2 text-sm bg-blue-700 hover:bg-blue-600 rounded cursor-pointer"
          onClick={() => handleNetworkSelection(network)}
        >
          {network}
        </button>
      ))}
    </aside>
  );
};

export default Sidebar;
