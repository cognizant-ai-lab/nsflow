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

import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  CardContent,
  Box,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
  Dialog,
  DialogContent,
  Typography,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Image as ImageIcon,
  Videocam as VideocamIcon,
  AudioFile as AudioFileIcon,
} from '@mui/icons-material';

export interface MultiMediaCardProps {
  /** URL of the multimedia file */
  url: string;
  /** Type of multimedia */
  type: 'image' | 'video' | 'audio';
  /** Whether this is an embedded video (iframe) vs direct file */
  isEmbed?: boolean;
  /** Original URL before conversion to embed URL */
  originalUrl?: string;
  /** Optional index for unique identification */
  index?: number;
  /** Optional callback when URL is copied */
  onCopy?: (url: string) => void;
}

/**
 * MultiMediaCard
 *
 * Beautiful MUI card for displaying multimedia content (images, videos, audio)
 * with controls for play/pause, maximize/minimize, copy URL, download, and expand/collapse.
 * Also supports embedded videos from platforms like YouTube, Vimeo, etc.
 */
export function MultiMediaCard({ url, type, isEmbed = false, originalUrl, index = 0, onCopy }: MultiMediaCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const theme = useTheme();

  // Determine color and icon based on media type
  const getMediaConfig = () => {
    switch (type) {
      case 'image':
        return {
          color: theme.palette.info.main,
          icon: ImageIcon,
          label: 'Image',
        };
      case 'video':
        return {
          color: theme.palette.error.main,
          icon: VideocamIcon,
          label: 'Video',
        };
      case 'audio':
        return {
          color: theme.palette.success.main,
          icon: AudioFileIcon,
          label: 'Audio',
        };
    }
  };

  const config = getMediaConfig();
  const IconComponent = config.icon;
  const isDarkMode = theme.palette.mode === 'dark';

  const handlePlayPause = () => {
    if (mediaRef.current) {
      if (isPlaying) {
        mediaRef.current.pause();
      } else {
        mediaRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleCopyURL = () => {
    // For embedded videos, copy the original URL instead of the embed URL
    const urlToCopy = isEmbed && originalUrl ? originalUrl : url;
    navigator.clipboard.writeText(urlToCopy);
    if (onCopy) {
      onCopy(urlToCopy);
    }
  };

  const handleDownload = async () => {
    // For embedded videos, open the original URL in a new tab (can't download embedded content)
    if (isEmbed) {
      window.open(originalUrl || url, '_blank');
      return;
    }

    try {
      // For local files or CORS-enabled URLs, download directly
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = url.split('/').pop() || `media_${index}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      // If fetch fails (CORS), fallback to opening in new tab
      console.warn('Download failed, opening in new tab:', error);
      window.open(url, '_blank');
    }
  };

  const handleMaximize = () => {
    setIsMaximized(true);
  };

  const handleMinimize = () => {
    setIsMaximized(false);
  };

  // Listen to media play/pause events
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || type === 'image') return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);

    return () => {
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
    };
  }, [type]);

  // Extract filename from URL for display
  const getFileName = () => {
    // For embedded videos, try to extract platform name from original URL
    if (isEmbed && originalUrl) {
      if (originalUrl.includes('youtube.com') || originalUrl.includes('youtu.be')) {
        return 'YouTube Video';
      } else if (originalUrl.includes('vimeo.com')) {
        return 'Vimeo Video';
      } else if (originalUrl.includes('dailymotion.com')) {
        return 'Dailymotion Video';
      } else if (originalUrl.includes('twitch.tv')) {
        return 'Twitch Video';
      }
      return 'Embedded Video';
    }

    try {
      const urlObj = new URL(url);
      return urlObj.pathname.split('/').pop() || 'media file';
    } catch {
      return url.split('/').pop() || 'media file';
    }
  };

  const renderMediaContent = (isDialog = false) => {
    const containerStyle = isDialog
      ? { width: '100%', height: 'auto', maxHeight: '80vh' }
      : { width: '100%', height: 'auto', maxHeight: 400 };

    switch (type) {
      case 'image':
        if (hasError) {
          return (
            <Box
              sx={{
                width: '100%',
                minHeight: 200,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: alpha(theme.palette.error.main, 0.05),
                borderRadius: 2,
                p: 3,
              }}
            >
              <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                Failed to load image
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', wordBreak: 'break-all' }}>
                {url}
              </Typography>
            </Box>
          );
        }
        return (
          <Box
            component="img"
            src={url}
            alt={getFileName()}
            onError={() => setHasError(true)}
            sx={{
              ...containerStyle,
              objectFit: 'contain',
              borderRadius: isDialog ? 0 : 2,
              display: 'block',
            }}
          />
        );
      case 'video':
        // For embedded videos, render an iframe
        if (isEmbed) {
          const height = isDialog ? 600 : 400;
          return (
            <Box
              component="iframe"
              src={url}
              title={getFileName()}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              sx={{
                width: '100%',
                height: height,
                border: 'none',
                borderRadius: isDialog ? 0 : 2,
                display: 'block',
                backgroundColor: alpha(theme.palette.common.black, 0.05),
              }}
            />
          );
        }
        // For direct video files, use video element
        return (
          <Box
            component="video"
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={url}
            controls
            sx={{
              ...containerStyle,
              objectFit: 'contain',
              borderRadius: isDialog ? 0 : 2,
              display: 'block',
              backgroundColor: alpha(theme.palette.common.black, 0.05),
            }}
          />
        );
      case 'audio':
        return (
          <Box
            sx={{
              width: '100%',
              p: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: alpha(config.color, 0.05),
              borderRadius: 2,
            }}
          >
            <Box
              component="audio"
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={url}
              controls
              sx={{ width: '100%', maxWidth: 500 }}
            />
          </Box>
        );
    }
  };

  return (
    <>
      <Card
        sx={{
          maxWidth: 700,
          borderRadius: 2,
          borderLeft: `4px solid ${config.color}`,
          boxShadow: isDarkMode
            ? '0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 2px 8px rgba(0, 0, 0, 0.08)',
          transition: 'all 0.2s ease',
          '&:hover': {
            boxShadow: isDarkMode
              ? '0 4px 16px rgba(0, 0, 0, 0.5)'
              : '0 4px 16px rgba(0, 0, 0, 0.12)',
          },
          mb: 1,
          backgroundColor: theme.palette.background.paper,
        }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          {/* Header */}
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            mb={expanded ? 1 : 0}
            sx={{
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Box display="flex" alignItems="center" gap={1} sx={{ minWidth: 0, flex: '1 1 auto' }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: alpha(config.color, 0.15),
                  flexShrink: 0,
                }}
              >
                <IconComponent sx={{ color: config.color, fontSize: 20 }} />
              </Box>
              <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ color: theme.palette.text.primary, lineHeight: 1.2 }}
                >
                  {config.label}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: theme.palette.text.secondary,
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {getFileName()}
                </Typography>
              </Box>
            </Box>

            {/* Controls */}
            <Box
              display="flex"
              gap={0.5}
              sx={{
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.2s ease',
                flexShrink: 0,
              }}
            >
              {/* Play/Pause for video and audio (not for embedded videos - they have their own controls) */}
              {(type === 'video' || type === 'audio') && !isEmbed && (
                <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
                  <IconButton
                    size="small"
                    onClick={handlePlayPause}
                    sx={{
                      color: theme.palette.text.secondary,
                      '&:hover': {
                        backgroundColor: alpha(config.color, 0.1),
                        color: config.color,
                      },
                    }}
                  >
                    {isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              )}

              {/* Maximize for image and video */}
              {(type === 'image' || type === 'video') && (
                <Tooltip title="Maximize">
                  <IconButton
                    size="small"
                    onClick={handleMaximize}
                    sx={{
                      color: theme.palette.text.secondary,
                      '&:hover': {
                        backgroundColor: alpha(config.color, 0.1),
                        color: config.color,
                      },
                    }}
                  >
                    <FullscreenIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}

              {/* Copy URL */}
              <Tooltip title="Copy URL">
                <IconButton
                  size="small"
                  onClick={handleCopyURL}
                  sx={{
                    color: theme.palette.text.secondary,
                    '&:hover': {
                      backgroundColor: alpha(config.color, 0.1),
                      color: config.color,
                    },
                  }}
                >
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              {/* Download / Open in new tab */}
              <Tooltip title={isEmbed ? 'Open in new tab' : 'Download'}>
                <IconButton
                  size="small"
                  onClick={handleDownload}
                  sx={{
                    color: theme.palette.text.secondary,
                    '&:hover': {
                      backgroundColor: alpha(config.color, 0.1),
                      color: config.color,
                    },
                  }}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              {/* Expand/Collapse */}
              <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
                <IconButton
                  size="small"
                  onClick={() => setExpanded(!expanded)}
                  sx={{
                    color: theme.palette.text.secondary,
                    '&:hover': {
                      backgroundColor: alpha(config.color, 0.1),
                      color: config.color,
                    },
                  }}
                >
                  {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Media Content */}
          {expanded && <Box sx={{ mt: 1 }}>{renderMediaContent()}</Box>}
        </CardContent>
      </Card>

      {/* Maximized Dialog for Image/Video */}
      <Dialog
        open={isMaximized}
        onClose={handleMinimize}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: alpha(theme.palette.background.paper, 0.95),
            backgroundImage: 'none',
          },
        }}
      >
        <DialogContent sx={{ p: 2, position: 'relative' }}>
          <IconButton
            onClick={handleMinimize}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              color: theme.palette.text.primary,
              backgroundColor: alpha(theme.palette.background.paper, 0.8),
              '&:hover': {
                backgroundColor: alpha(theme.palette.background.paper, 0.95),
              },
              zIndex: 1,
            }}
          >
            <FullscreenExitIcon />
          </IconButton>
          {renderMediaContent(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}
