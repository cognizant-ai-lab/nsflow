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

import * as React from "react";
import { useEffect } from "react";
import { Box } from "@mui/material";
import Header from "../../components/Header";
import { CruseInterface } from "../../components/cruse/CruseInterface";
import EditorLogsPanel from "../../components/EditorLogsPanel";
import { ApiPortProvider } from "../../context/ApiPortContext";
import { NeuroSanProvider } from "../../context/NeuroSanContext";
import { ChatProvider, useChatContext } from "../../context/ChatContext";
import { getInitialTheme } from "../../utils/theme";

const CruseContent: React.FC = () => {
  const { setIsEditorMode } = useChatContext();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getInitialTheme());
    // Set editor mode to false for CRUSE (it's a chat interface, not editor)
    setIsEditorMode(false);

    return () => setIsEditorMode(false);
  }, [setIsEditorMode]);

  return (
    <ApiPortProvider>
      <NeuroSanProvider>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100vw',
            bgcolor: 'background.default',
            overflow: 'hidden',
          }}
        >
          <Header selectedNetwork="" isCrusePage={true} />

          <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <CruseInterface />

            {/* Expandable Logs Panel in bottom center-left */}
            <EditorLogsPanel />
          </Box>
        </Box>
      </NeuroSanProvider>
    </ApiPortProvider>
  );
};

const Cruse: React.FC = () => {
  return (
    <ChatProvider>
      <CruseContent />
    </ChatProvider>
  );
};

export default Cruse;
