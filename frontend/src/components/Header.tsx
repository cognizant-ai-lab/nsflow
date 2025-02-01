import React from "react";
import { FaUserCircle, FaFolderOpen, FaSave, FaDownload } from "react-icons/fa";
import logo from "../assets/icon.jpg"; // Import the logo

const Header: React.FC = () => {
  return (
    <header className="flex items-center justify-between bg-gray-800 text-white h-14 px-4 shadow-md">
      {/* Left - App Icon */}
      <div className="flex items-center space-x-2">
        <img src={logo} alt="App Icon" className="h-8 w-8" />
        <span className="text-lg font-semibold">AgentFlow</span>
      </div>

      {/* Middle - Navigation Buttons */}
      <div className="flex space-x-4">
        <button className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded flex items-center">
          <FaFolderOpen className="mr-2" /> Load From
        </button>
        <button className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded flex items-center">
          <FaSave className="mr-2" /> Save As
        </button>
        <button className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded flex items-center">
          <FaDownload className="mr-2" /> Export
        </button>
      </div>

      {/* Right - User Profile Icon */}
      <div className="flex items-center">
        <FaUserCircle className="h-8 w-8 text-gray-400 cursor-pointer hover:text-white" />
      </div>
    </header>
  );
};

export default Header;
