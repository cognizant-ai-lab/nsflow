
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
import React, { useState, useRef, useEffect } from "react";
import { FaUserCircle, FaEdit, FaDownload, FaHome } from "react-icons/fa";
import { FaArrowsRotate } from "react-icons/fa6";
import { ImPower  } from "react-icons/im";
import { useApiPort } from "../context/ApiPortContext";
import { useNavigate } from "react-router-dom";

import ThemeToggle from "./ThemeToggle";

const Header: React.FC<{ selectedNetwork: string; isEditorPage?: boolean }> = ({ selectedNetwork, isEditorPage = false }) => {
  const { apiUrl } = useApiPort();
  const [exportDropdown, setExportDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  // const location = useLocation();

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

    const response = await fetch(`${apiUrl}/api/v1/export/notebook/${selectedNetwork}`);
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

    const response = await fetch(`${apiUrl}/api/v1/export/agent_network/${selectedNetwork}`);
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
    <header className="header-panel flex items-center justify-between px-4 shadow-md relative z-50 h-14">
      {/* Left - App Icon */}
      <div className="flex items-center space-x-2">
        <ImPower className="h-8 w-8 text-blue-400" />
        <span className="text-lg font-semibold">Neuro AI - Multi-Agent Accelerator Client</span>
      </div>

      {/* Middle - Navigation Buttons */}
      <div className="flex space-x-4">
        {/* Reload */}
        <button className="header-btn h-8 px-4 py-1" onClick={() => window.location.reload()}>
          <FaArrowsRotate className="mr-2" /> Reload
        </button>

        {/* Spacer */}
        <div className="w-6" />

        {/* Home */}
        <button 
          className={`header-btn h-8 px-4 py-1 ${!isEditorPage ? 'bg-blue-600' : ''}`}
          onClick={() => navigate("/home")}
        >
          <FaHome className="mr-2" /> Home
        </button>

        {/* Editor */}
        <button 
          className={`header-btn h-8 px-4 py-1 ${isEditorPage ? 'bg-blue-600' : ''}`}
          onClick={() => navigate("/editor")}
        >
          <FaEdit className="mr-2" /> Editor
        </button>
        {/* Observe */}

        {/* {location.pathname !== "/observability" && (
          <button
            className="header-btn h-8 px-4 py-1"
            title="Coming soon"
            // onClick={() => window.open("/observability", "_blank", "noopener,noreferrer")}
          >
            <FaChartBar className="mr-2" /> Observe
          </button>
        )} */}

        {/* Export Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="header-btn flex items-center h-8 px-4 py-1 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition duration-200"
            onClick={() => setExportDropdown(!exportDropdown)}
          >
            <FaDownload className="mr-2" /> Export{" "}
            <span className={`ml-2 mr-2 transition-transform duration-200 ${exportDropdown ? "rotate-90" : "rotate-0"}`}>
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

      {/* Right - Theme Toggle + Profile */}
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <FaUserCircle className="h-8 w-8 text-gray-400 cursor-pointer hover:text-white" />
      </div>
    </header>
  );
};

export default Header;
