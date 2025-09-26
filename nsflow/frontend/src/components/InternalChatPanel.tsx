
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
import { useEffect, useRef, useState } from "react";
import { 
  Box, 
  Typography, 
  IconButton, 
  Paper, 
  Tooltip, 
  useTheme,
  alpha
} from "@mui/material";
import { Download as DownloadIcon } from "@mui/icons-material";
import { useChatContext } from "../context/ChatContext";
import { PanelGroup, Panel } from "react-resizable-panels";
import ScrollableMessageContainer from "./ScrollableMessageContainer";

const InternalChatPanel = ({ title = "Internal Chat" }: { title?: string }) => {
  const { internalChatMessages } = useChatContext();
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Auto-scroll reference
  const theme = useTheme();

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [internalChatMessages]);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  const downloadMessages = () => {
    const logText = internalChatMessages
      .map((msg) => `${msg.sender}: ${msg.text}`)
      .join("\n");

    const blob = new Blob([logText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "internal_chat_logs.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        backgroundColor: theme.palette.background.paper,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <PanelGroup direction="vertical">
        {/* Panel 1: Header + Message List */}
        <Panel defaultSize={75} minSize={30}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%', 
            p: 2, 
            overflow: 'hidden' 
          }}>
            {/* Header */}
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              mb: 2,
              pb: 1,
              borderBottom: `1px solid ${theme.palette.divider}`
            }}>
              <Typography variant="h6" sx={{ 
                fontWeight: 600, 
                color: theme.palette.text.primary 
              }}>
                {title}
              </Typography>
              
              <Tooltip title="Download Messages">
                <IconButton
                  size="small"
                  onClick={downloadMessages}
                  sx={{ 
                    color: theme.palette.text.secondary,
                    '&:hover': { 
                      color: theme.palette.primary.main,
                      backgroundColor: alpha(theme.palette.primary.main, 0.1)
                    }
                  }}
                >
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Scrollable chat messages container */}
            <ScrollableMessageContainer
              messages={internalChatMessages}
              copiedMessage={copiedMessage}
              onCopy={copyToClipboard}
              renderSenderLabel={(msg) => msg.sender} // Raw label
              getMessageClass={() => "chat-msg chat-msg-agent"} 
            />
          </Box>
        </Panel>
      </PanelGroup>
    </Paper>
  );
};

export default InternalChatPanel;
