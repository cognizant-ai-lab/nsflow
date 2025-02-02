import React from "react";
import { FaUserCircle, FaFolderOpen, FaSave, FaDownload } from "react-icons/fa";
import logo from "../assets/icon.jpg"; // Import the logo

const Header: React.FC = () => {
  return (
    <header className="header flex items-center justify-between px-4 shadow-md">
      {/* Left - App Icon */}
      <div className="flex items-center space-x-2">
        <img src={logo} alt="App Icon" className="h-8 w-8" />
        <span className="text-lg font-semibold">Neuro - Smart Agent Network</span>
      </div>

      {/* Middle - Navigation Buttons */}
      <div className="flex space-x-4">
        <button className="header-btn">
          <FaFolderOpen className="mr-2" /> Load From
        </button>
        <button className="header-btn">
          <FaSave className="mr-2" /> Save As
        </button>
        <button className="header-btn">
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
