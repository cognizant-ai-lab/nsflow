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

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Box, Typography, FormLabel, FormHelperText, Chip, Stack } from '@mui/material';
import { CloudUpload as UploadIcon, AttachFile as FileIcon, Close as CloseIcon } from '@mui/icons-material';
import type { WidgetFieldProps } from '../../../types/cruse';

/**
 * FileUploadField Component
 *
 * File upload widget using react-dropzone.
 * Supports single or multiple files, drag-and-drop, and file type restrictions.
 *
 * JSON Schema format:
 * {
 *   "type": "string",  // For single file (stores filename)
 *   "title": "Upload Document",
 *   "description": "Upload a PDF file",
 *   "x-ui": {
 *     "widget": "file",
 *     "accept": ".pdf,.doc,.docx",  // File types to accept
 *     "maxFiles": 1,                 // Max number of files (default: 1)
 *     "maxSize": 5242880             // Max file size in bytes (default: 5MB)
 *   }
 * }
 *
 * For multiple files:
 * {
 *   "type": "array",
 *   "items": { "type": "string" },
 *   "title": "Upload Files",
 *   "x-ui": {
 *     "widget": "file",
 *     "maxFiles": 5
 *   }
 * }
 */
export function FileUploadField({
  label,
  required = false,
  disabled = false,
  value,
  onChange,
  error,
  schema,
}: WidgetFieldProps) {
  const description = schema.description;

  // Get x-ui configuration
  const xUi = (schema as Record<string, unknown>)['x-ui'] as Record<string, unknown> | undefined;
  const accept = (xUi?.accept as string | undefined) || undefined;
  const maxFiles = (xUi?.maxFiles as number | undefined) || 1;
  const maxSize = (xUi?.maxSize as number | undefined) || 5 * 1024 * 1024; // 5MB default

  // Parse current value (array of file objects or single file)
  const currentFiles: File[] = Array.isArray(value) ? value : value ? [value] : [];

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (maxFiles === 1) {
        // Single file mode
        onChange(acceptedFiles[0]);
      } else {
        // Multiple files mode
        const newFiles = [...currentFiles, ...acceptedFiles].slice(0, maxFiles);
        onChange(newFiles);
      }
    },
    [currentFiles, maxFiles, onChange]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: accept
      ? accept.split(',').reduce((acc, ext) => {
          acc[`application/${ext.trim().replace('.', '')}`] = [ext.trim()];
          return acc;
        }, {} as Record<string, string[]>)
      : undefined,
    maxFiles,
    maxSize,
    disabled,
    multiple: maxFiles > 1,
  });

  const handleRemoveFile = (index: number) => {
    if (maxFiles === 1) {
      onChange(undefined);
    } else {
      const newFiles = currentFiles.filter((_, i) => i !== index);
      onChange(newFiles.length > 0 ? newFiles : undefined);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Box sx={{ mb: 2 }}>
      {label && (
        <FormLabel required={required} disabled={disabled} error={!!error}>
          {label}
        </FormLabel>
      )}

      {/* Dropzone Area */}
      <Box
        {...getRootProps()}
        sx={{
          mt: 1,
          p: 3,
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : error ? 'error.main' : 'grey.400',
          borderRadius: 2,
          bgcolor: isDragActive ? 'action.hover' : 'background.paper',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          textAlign: 'center',
          '&:hover': disabled
            ? {}
            : {
                borderColor: 'primary.main',
                bgcolor: 'action.hover',
              },
        }}
      >
        <input {...getInputProps()} />
        <UploadIcon
          sx={{
            fontSize: 48,
            color: isDragActive ? 'primary.main' : 'text.secondary',
            mb: 1,
          }}
        />
        <Typography variant="body1" color="text.primary" gutterBottom>
          {isDragActive ? 'Drop files here...' : 'Drag & drop files here, or click to select'}
        </Typography>
        {description && (
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        )}
        {accept && (
          <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
            Accepted: {accept}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" display="block">
          Max {maxFiles} file{maxFiles > 1 ? 's' : ''}, {formatFileSize(maxSize)} each
        </Typography>
      </Box>

      {/* Uploaded Files */}
      {currentFiles.length > 0 && (
        <Stack spacing={1} sx={{ mt: 2 }}>
          {currentFiles.map((file, index) => (
            <Chip
              key={index}
              icon={<FileIcon />}
              label={`${file.name} (${formatFileSize(file.size)})`}
              onDelete={disabled ? undefined : () => handleRemoveFile(index)}
              deleteIcon={<CloseIcon />}
              variant="outlined"
              sx={{ justifyContent: 'space-between' }}
            />
          ))}
        </Stack>
      )}

      {/* File Rejection Errors */}
      {fileRejections.length > 0 && (
        <FormHelperText error>
          {fileRejections.map(({ file, errors }) => (
            <div key={file.name}>
              {file.name}: {errors.map((e) => e.message).join(', ')}
            </div>
          ))}
        </FormHelperText>
      )}

      {/* Validation Error */}
      {error && <FormHelperText error>{error}</FormHelperText>}
    </Box>
  );
}
