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

import { useEffect, useState, useRef } from "react";
import { useApiPort } from "../context/ApiPortContext";
import { FaSearch, FaNetworkWired, FaRobot } from "react-icons/fa";

interface NetworkInfo {
  name: string;
  last_updated?: string;
  source?: string;
  has_state: boolean;
  agent_count?: number;
  agents?: string[];
}

interface AgentNode {
  id: string;
  type: string;
  data: {
    label: string;
    instructions: string;
    is_defined: boolean;
    network_name?: string;
  };
}

const EditorSidebar = ({ onSelectNetwork }: { onSelectNetwork: (network: string) => void }) => {
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [agents, setAgents] = useState<AgentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const { apiUrl, isReady } = useApiPort();
  const [searchQuery, setSearchQuery] = useState("");

  const networksEndRef = useRef<HTMLDivElement>(null);

  // Fetch networks with state
  const fetchNetworks = async () => {
    if (!isReady || !apiUrl) return;

    try {
      setLoading(true);
      const response = await fetch(`${apiUrl}/api/v1/editor/state/networks`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch networks: ${response.statusText}`);
      }

      const data = await response.json();
      setNetworks(data.networks || []);
      setError("");
    } catch (err: any) {
      console.error("Error fetching networks:", err);
      setError(`Failed to load networks: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch agents for selected network
  const fetchAgents = async (networkName: string) => {
    if (!isReady || !apiUrl || !networkName) return;

    try {
      const response = await fetch(`${apiUrl}/api/v1/editor/state/connectivity/${networkName}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch agents for ${networkName}`);
      }

      const data = await response.json();
      setAgents(data.nodes || []);
    } catch (err: any) {
      console.error("Error fetching agents:", err);
      setAgents([]);
    }
  };

  // Handle network selection
  const handleNetworkSelect = (networkName: string) => {
    setSelectedNetwork(networkName);
    onSelectNetwork(networkName);
    fetchAgents(networkName);
  };

  // Filter agents based on search query
  const filteredAgents = agents.filter((agent) =>
    agent.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.data.instructions.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Initial load
  useEffect(() => {
    fetchNetworks();
  }, [isReady, apiUrl]);

  // Auto-select first network if available
  useEffect(() => {
    if (networks.length > 0 && !selectedNetwork) {
      const firstNetwork = networks[0];
      handleNetworkSelect(firstNetwork.name);
    }
  }, [networks]);

  return (
    <div className="h-full bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center">
          <FaNetworkWired className="mr-2 text-blue-400" />
          Agent Networks
        </h2>

        {/* Network Selection */}
        {loading && (
          <div className="text-gray-400 text-sm">Loading networks...</div>
        )}

        {error && (
          <div className="text-red-400 text-sm mb-2">{error}</div>
        )}

        {!loading && networks.length > 0 && (
          <select
            value={selectedNetwork}
            onChange={(e) => handleNetworkSelect(e.target.value)}
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:border-blue-400 focus:outline-none"
          >
            <option value="">Select a network...</option>
            {networks.map((network) => (
              <option key={network.name} value={network.name}>
                {network.name} ({network.agent_count || 0} agents)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Search Box */}
      {selectedNetwork && (
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Agents List */}
      <div className="flex-1 overflow-y-auto">
        {selectedNetwork && (
          <div className="p-2">
            <h3 className="text-sm font-medium text-gray-300 mb-2 px-2 flex items-center">
              <FaRobot className="mr-2 text-green-400" />
              Agents ({filteredAgents.length})
            </h3>

            {filteredAgents.length === 0 && (
              <div className="text-gray-400 text-sm px-2">
                {searchQuery ? "No agents match your search" : "No agents found"}
              </div>
            )}

            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className="mb-2 p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors border-l-4 border-blue-400"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-white text-sm font-medium mb-1">
                      {agent.data.label}
                    </h4>
                    <p className="text-gray-300 text-xs mb-2 line-clamp-3">
                      {agent.data.instructions || "No instructions provided"}
                    </p>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        agent.data.is_defined 
                          ? 'bg-green-600 text-green-100' 
                          : 'bg-orange-600 text-orange-100'
                      }`}>
                        {agent.data.is_defined ? 'Defined' : 'Referenced'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {agent.type}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!selectedNetwork && (
          <div className="p-4 text-gray-400 text-sm text-center">
            Select a network to view its agents
          </div>
        )}

        <div ref={networksEndRef} />
      </div>

      {/* Refresh Button */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={fetchNetworks}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh Networks"}
        </button>
      </div>
    </div>
  );
};

export default EditorSidebar;
