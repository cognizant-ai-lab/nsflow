
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

import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home/Home';
import Observability from '../pages/Observability/Observability';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} /> {/* Serve Home directly at "/" */}
      <Route path="/observability" element={<Observability />} />
      <Route path="*" element={<Home />} /> {/* Optional fallback */}
    </Routes>
  );
}
