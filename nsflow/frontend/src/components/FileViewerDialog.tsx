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
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  IconButton,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  InsertDriveFile as FileIcon,
} from "@mui/icons-material";

export interface ViewableFile {
  file: File;
  content: string;
  isPdf?: boolean;
  previewUrl?: string;
}

interface FileViewerDialogProps {
  file: ViewableFile | null;
  onClose: () => void;
}

const FileViewerDialog: React.FC<FileViewerDialogProps> = ({ file, onClose }) => {
  const theme = useTheme();
  return (
    <Dialog
      open={!!file}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: "90vh",
          height: file?.isPdf ? "90vh" : "auto",
          backgroundColor: theme.palette.background.paper,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          pb: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <FileIcon sx={{ color: theme.palette.primary.main }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {file?.file.name}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 2, pb: 2, height: file?.isPdf ? "calc(90vh - 120px)" : "auto" }}>
        {file?.isPdf ? (
          <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
            <iframe
              src={file.previewUrl}
              style={{ width: "100%", height: "100%", border: "none", borderRadius: 4 }}
              title={`PDF Preview: ${file.file.name}`}
            />
          </Box>
        ) : (
          <Box
            sx={{
              p: 2,
              backgroundColor: alpha(theme.palette.background.default, 0.5),
              borderRadius: 1,
              maxHeight: "60vh",
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: "0.875rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              "&::-webkit-scrollbar": { width: 8 },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: alpha(theme.palette.text.primary, 0.2),
                borderRadius: 8,
              },
            }}
          >
            {file?.content}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FileViewerDialog;
