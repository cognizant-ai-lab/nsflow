import React, { useEffect, useState } from "react";

const Sidebar = ({ onSelectNetwork }: { onSelectNetwork: (network: string) => void }) => {
  const [networks, setNetworks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/v1/networks/")
      .then((res) => res.json())
      .then((data) => {
        setNetworks(data.networks);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load agent networks.");
        setLoading(false);
      });
  }, []);

  return (
    <aside className="h-full sidebar p-4 flex flex-col gap-3 border-r">
      <h2 className="text-lg font-bold">Agent Networks</h2>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {networks.map((network) => (
        <button
          key={network}
          className="p-2 text-sm bg-blue-700 hover:bg-blue-600 rounded cursor-pointer"
          onClick={() => onSelectNetwork(network)}
        >
          {network}
        </button>
      ))}
    </aside>
  );
};

export default Sidebar;
