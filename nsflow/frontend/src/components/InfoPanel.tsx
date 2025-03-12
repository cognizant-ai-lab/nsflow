import { FaGithub, FaBookOpen, FaInfoCircle } from "react-icons/fa";
import { SiFastapi } from "react-icons/si";
import { useApiPort } from "../context/ApiPortContext";

const InfoPanel = () => {
  const { apiPort } = useApiPort();

  return (
    <div className="info-panel p-4 bg-gray-900 border border-gray-700 rounded-md">
      <div className="logs-header flex justify-between items-center mb-2">
        <h2 className="text-white text-lg">Info</h2>
      </div>

      <div className="logs-messages max-h-96 p-2 bg-gray-800 border border-gray-600 rounded-md">
        {/* Resources */}
        <div className="space-y-2">
          <p className="font-bold text-gray-400">Resources:</p>
          
          {/* App Version */}
        <div className="flex items-center text-gray-400">
          <FaInfoCircle className="mr-2" /> App Version: <span className="ml-1 text-white">0.5.0</span>
        </div>

          {/* GitHub Link */}
          <a
            href="https://github.com/leaf-ai/nsflow"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-blue-400 hover:text-blue-300"
          >
            <FaGithub className="mr-2" /> GitHub
          </a>

          {/* FastAPI Docs Link */}
          <a
            href={`http://localhost:${apiPort}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-blue-400 hover:text-blue-300"
          >
            <SiFastapi className="mr-2" /> FastAPI Specs
          </a>

          {/* Documentation (Placeholder) */}
          <div className="flex items-center text-gray-500">
            <FaBookOpen className="mr-2" /> Documentation (Coming Soon)
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoPanel;
