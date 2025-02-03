import React, { useState, useRef, useEffect } from "react";
import { FaUserCircle, FaFolderOpen, FaSave, FaDownload } from "react-icons/fa";
import logo from "../assets/icon.jpg";

const Header: React.FC<{ selectedNetwork: string }> = ({ selectedNetwork }) => {
  const [exportDropdown, setExportDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExportDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleExportNotebook = async () => {
    if (!selectedNetwork) {
      alert("Please select an agent network first.");
      return;
    }

    const response = await fetch(`http://127.0.0.1:8000/api/v1/export/notebook/${selectedNetwork}`);
    if (!response.ok) {
      alert("Failed to generate notebook.");
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedNetwork}.ipynb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportAgentNetwork = async () => {
    if (!selectedNetwork) {
      alert("Please select an agent network first.");
      return;
    }

    const response = await fetch(`http://127.0.0.1:8000/api/v1/export/agent_network/${selectedNetwork}`);
    if (!response.ok) {
      alert("Failed to download agent network.");
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedNetwork}.hocon`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <header className="header flex items-center justify-between px-4 shadow-md relative z-50 bg-gray-900 h-14">
      {/* Left - App Icon */}
      <div className="flex items-center space-x-2">
        <img src={logo} alt="App Icon" className="h-8 w-8" />
        <span className="text-lg font-semibold text-white">Neuro AI - Smart Agent Network</span>
      </div>

      {/* Middle - Navigation Buttons */}
      <div className="flex space-x-4">
        <button className="header-btn h-8 px-4 py-1">
          <FaFolderOpen className="mr-2" /> Load From
        </button>
        <button className="header-btn h-8 px-4 py-1">
          <FaSave className="mr-2" /> Save As
        </button>

        {/* Export Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="header-btn flex items-center h-8 px-4 py-1 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition duration-200"
            onClick={() => setExportDropdown(!exportDropdown)}
          >
            <FaDownload className="mr-2" /> Export{" "}
            <span className={`ml-2 mr-2 transition-transform duration-200 ${exportDropdown ? "rotate-180" : "rotate-0"}`}>
              ▶
            </span>
          </button>

          {exportDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50">
              <button
                className="block px-4 py-2 h-10 text-white hover:bg-gray-700 w-full text-left"
                onClick={handleExportNotebook}
              >
                Export as Notebook
              </button>
              <button
                className="block px-4 py-2 h-10 text-white hover:bg-gray-700 w-full text-left"
                onClick={handleExportAgentNetwork}
              >
                Export Agent Network
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right - User Profile Icon */}
      <div className="flex items-center">
        <FaUserCircle className="h-8 w-8 text-gray-400 cursor-pointer hover:text-white" />
      </div>
    </header>
  );
};

export default Header;
