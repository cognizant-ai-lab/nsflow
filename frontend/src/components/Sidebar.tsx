import React, { useEffect, useState } from "react";

const Sidebar = ({ onSelectNetwork }: { onSelectNetwork: (network: string) => void }) => {
  const [networks, setNetworks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/networks/")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("Fetched networks:", data.networks);  // ✅ Debugging log
        setNetworks(data.networks);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching networks:", err);
        setError("Failed to load agent networks.");
        setLoading(false);
      });
  }, []);

  return (
    <aside className="h-full bg-gray-900 text-white p-4 flex flex-col gap-4">
      <h2 className="text-lg font-bold">Agent Networks</h2>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {networks.length > 0 ? (
        networks.map((network) => (
          <button
            key={network}
            className="p-2 bg-blue-600 hover:bg-blue-700 rounded cursor-pointer"
            onClick={() => onSelectNetwork(network)}
          >
            {network}
          </button>
        ))
      ) : (
        !loading && <p>No networks found.</p>
      )}
    </aside>
  );
};

export default Sidebar;
