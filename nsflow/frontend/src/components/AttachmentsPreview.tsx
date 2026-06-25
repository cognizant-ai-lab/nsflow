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
import { Stack, Chip, alpha, useTheme } from "@mui/material";
import { AttachFile as AttachFileIcon, Close as CloseIcon } from "@mui/icons-material";
import type { AttachedFile } from "../hooks/useFileAttachments";

interface AttachmentsPreviewProps {
  files: AttachedFile[];
  onOpen: (file: AttachedFile) => void;
  onRemove: (index: number) => void;
}

const AttachmentsPreview: React.FC<AttachmentsPreviewProps> = ({ files, onOpen, onRemove }) => {
  const theme = useTheme();
  if (files.length === 0) return null;
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {files.map((af, index) => (
        <Chip
          key={`${af.file.name}-${index}`}
          icon={<AttachFileIcon sx={{ fontSize: 14 }} />}
          label={af.file.name}
          size="small"
          onClick={() => onOpen(af)}
          onDelete={() => onRemove(index)}
          deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
          variant="outlined"
          sx={{
            height: 22,
            "& .MuiChip-label": { fontSize: "0.7rem", px: 0.5, cursor: "pointer" },
            borderColor: theme.palette.primary.main,
            color: theme.palette.text.primary,
            "&:hover": {
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
            },
          }}
        />
      ))}
    </Stack>
  );
};

export default AttachmentsPreview;
