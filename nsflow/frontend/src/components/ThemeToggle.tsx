import React, { useEffect, useState } from "react";
import { FaSun, FaMoon } from "react-icons/fa";
import { getInitialTheme, applyTheme } from "../utils/theme";

const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <button
      onClick={toggleTheme}
      className="text-gray-400 hover:text-white p-2 rounded-full"
      title="Toggle Theme"
    >
      {theme === "dark" ? <FaSun className="h-5 w-5" /> : <FaMoon className="h-5 w-5" />}
    </button>
  );
};

export default ThemeToggle;
