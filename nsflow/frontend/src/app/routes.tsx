
/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home/Home';
import Editor from '../pages/Editor/Editor';
import Cruse from '../pages/Cruse/Cruse';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} /> {/* Serve Home directly at "/" */}
      <Route path="/home" element={<Home />} /> {/* Explicit home route */}
      <Route path="/editor" element={<Editor />} /> {/* Editor page */}
      <Route path="/cruse" element={<Cruse />} /> {/* CRUSE chat interface */}
      <Route path="*" element={<Home />} /> {/* Optional fallback */}
    </Routes>
  );
}
