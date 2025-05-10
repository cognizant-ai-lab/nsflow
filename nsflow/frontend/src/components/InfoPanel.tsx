
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
import { useEffect, useState } from "react";
import { FaGithub, FaBookOpen } from "react-icons/fa";
import { SiFastapi } from "react-icons/si";
import { useApiPort } from "../context/ApiPortContext";

const InfoPanel = () => {
  const { apiPort } = useApiPort();
  const [versions, setVersions] = useState<{ nsflow: string; neuroSan: string }>({
    nsflow: "Loading...",
    neuroSan: "Loading...",
  });

  useEffect(() => {
    const fetchVersion = async (packageName: string) => {
      try {
        const response = await fetch(`http://127.0.0.1:${apiPort}/api/v1/version/${packageName}`);
        const data = await response.json();
        return data.version;
      } catch (err) {
        console.error(`Failed to fetch version for ${packageName}:`, err);
        return "Unknown";
      }
    };

    const fetchVersions = async () => {
      const nsflowVersion = await fetchVersion("nsflow");
      const neuroSanVersion = await fetchVersion("neuro-san");

      setVersions({
        nsflow: nsflowVersion,
        neuroSan: neuroSanVersion,
      });
    };

    fetchVersions();
  }, [apiPort]);

  return (
    <div className="logs-panel p-4 bg-gray-900 border border-gray-700 rounded-md">
      <div className="logs-header flex justify-between items-center mb-2">
        <h2 className="text-white text-lg">Info</h2>
      </div>
      <div className="logs-messages overflow-y-auto max-h-96 p-2 bg-gray-800 border border-gray-600 rounded-md">
        {/* Resources */}
        <div className="space-y-2">
          <p className="font-bold text-gray-400">Resources:</p>
          
          {/* Versions Display */}
          <div className="info-panel flex items-center">
            <a
                href="https://github.com/leaf-ai/neuro-san"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-blue-400 hover:text-blue-300"
              >
            <FaGithub className="mr-2" /> neuro-san v. {versions.neuroSan}
            </a>
          </div>
          <div className="info-panel flex items-center">
            <a
              href="https://github.com/leaf-ai/nsflow"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-blue-400 hover:text-blue-300"
            >
              <FaGithub className="mr-2" /> nsflow v. {versions.nsflow}
            </a>
          </div>

          {/* GitHub Link */}
          <a
            href="https://github.com/leaf-ai/neuro-san-demos"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-blue-400 hover:text-blue-300"
          >
            <FaGithub className="mr-2" /> neuro-san-demos
          </a>

          {/* FastAPI Docs Link */}
          <a
            href={`http://localhost:${apiPort}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-blue-400 hover:text-blue-300"
          >
            <SiFastapi className="mr-2" /> FastAPI (OpenAPI) Specs
          </a>

          {/* Documentation and User Guide */}
          <a
            href="https://github.com/leaf-ai/neuro-san-demos/blob/main/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-blue-400 hover:text-blue-300"
          >
            <FaBookOpen className="mr-2" /> User Guide
          </a>
        </div>
      </div>
    </div>
  );
};

export default InfoPanel;
