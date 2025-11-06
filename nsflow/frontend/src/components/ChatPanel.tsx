/*
Copyright 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

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

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelHandle } from "react-resizable-panels";
import {
  Box,
  Typography,
  IconButton,
  Paper,
  Tooltip,
  Button,
  TextField,
  alpha,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import {
  Download as DownloadIcon,
  StopCircle as StopIcon,
  Delete as DeleteIcon,
  Mic as MicIcon,
  Send as SendIcon,
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatControls } from "../hooks/useChatControls";
import { useChatContext } from "../context/ChatContext";
import { useTheme } from "../context/ThemeContext";
import ScrollableMessageContainer from "./ScrollableMessageContainer";
import { Mp3Encoder } from "@breezystack/lamejs";

// NEW: use cache + converter to source sly_data from the editor
import { useSlyDataCache } from "../hooks/useSlyDataCache";

const ChatPanel = ({ title = "Chat" }: { title?: string }) => {
  const useSpeech = import.meta.env.VITE_USE_SPEECH === "true";
  const { apiUrl } = useApiPort();
  const { theme } = useTheme();

  const {
    activeNetwork,
    chatMessages,
    addChatMessage,
    addSlyDataMessage,
    chatWs,
  } = useChatContext();

  const { stopWebSocket, clearChat } = useChatControls();

  const [newMessage, setNewMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputPanelRef = useRef<ImperativePanelHandle>(null);
  const messagePanelRef = useRef<ImperativePanelHandle>(null);

  // NEW: cache reader to get current editor data
  const { loadSlyDataFromCache } = useSlyDataCache();

  const slyToggleGlobalKey = 'nsflow-use-slydata';
  const slyToggleNetworkKey = useMemo(
    () => (activeNetwork ? `nsflow-use-slydata-${activeNetwork}` : null),
    [activeNetwork]
  );

  // ADD audioRef here
  const audioRef = useRef<HTMLAudioElement>(null);

  // Recording state and refs
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Flag to track when microphone was used for auto-play
  const [shouldAutoPlayNextAgent, setShouldAutoPlayNextAgent] = useState(false);
  const lastMessageCountRef = useRef(0);

  // helper to read persisted value (network → global → legacy)
  const readSlyToggle = (network?: string | null) => {
    try {
      if (network) {
        const v = localStorage.getItem(`nsflow-use-slydata-${network}`);
        if (v != null) return v === 'true';
      }
      const g = localStorage.getItem('nsflow-use-slydata');
      if (g != null) return g === 'true';
      const legacy = localStorage.getItem('nsflow-use-slydata-default');
      if (legacy != null) return legacy === 'true';
    } catch {}
    return false;
  };
  // NEW: “Use Sly Data” checkbox state
  const [useSlyDataChecked, setUseSlyDataChecked] = useState<boolean>(() => readSlyToggle(activeNetwork));

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Load persisted toggle when network changes (or first mount)
  useEffect(() => {
    // when network changes, prefer its stored setting if present
    const stored = readSlyToggle(activeNetwork);
    setUseSlyDataChecked(stored);
  }, [activeNetwork]);

  // Persist on change
  useEffect(() => {
    try {
      if (slyToggleNetworkKey) {
        localStorage.setItem(slyToggleNetworkKey, String(useSlyDataChecked));
      }
      localStorage.setItem(slyToggleGlobalKey, String(useSlyDataChecked));
    } catch {}
  }, [useSlyDataChecked, slyToggleNetworkKey]);

  // Auto-play agent responses when microphone was used
  useEffect(() => {
    if (shouldAutoPlayNextAgent && chatMessages.length > 0) {
      const currentMessageCount = chatMessages.length;
      const previousMessageCount = lastMessageCountRef.current;

      if (currentMessageCount > previousMessageCount) {
        const lastMessage = chatMessages[chatMessages.length - 1];
        if (lastMessage.sender === "agent") {
          setShouldAutoPlayNextAgent(false);
          lastMessageCountRef.current = currentMessageCount;
          const messageToPlay =
            typeof lastMessage.text === "string"
              ? lastMessage.text
              : JSON.stringify(lastMessage.text);
          const messageIndex = chatMessages.length - 1;
          setTimeout(() => {
            textToSpeech(messageToPlay, messageIndex);
          }, 100);
        } else {
          lastMessageCountRef.current = currentMessageCount;
        }
      }
    } else {
      lastMessageCountRef.current = chatMessages.length;
    }
  }, [chatMessages, shouldAutoPlayNextAgent]);

  // NEW: Build sly_data to send from the editor cache (or {} if none)
  const getSlyDataForSend = useCallback((): Record<string, any> | undefined => {
    if (!useSlyDataChecked) return undefined; // not requested
    const network = activeNetwork;
    if (!network) return {}; // no network context; still send {}
    const cached = loadSlyDataFromCache(network);
    console.log('Cached data:', cached);
    if (cached && cached.data && typeof cached.data === 'object' && !Array.isArray(cached.data) && Object.keys(cached.data).length > 0) {
      return cached.data; // cached data is already in JSON format
    }
    return {}; // if editor is blank, still send {}
  }, [useSlyDataChecked, activeNetwork, loadSlyDataFromCache]);

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    // Reset auto-play flag for typed messages (not from microphone)
    setShouldAutoPlayNextAgent(false);
    sendMessageWithText(newMessage);
  };

  const sendMessageWithText = (messageText: string) => {
    if (!messageText.trim()) return;
    if (!chatWs || chatWs.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected. Unable to send message.");
      return;
    }

    const slyDataToSend = getSlyDataForSend();

    addChatMessage({
      sender: "user",
      text: messageText,
      network: activeNetwork,
    });

    if (slyDataToSend) {
      addSlyDataMessage({
        sender: "user",
        text: JSON.stringify(slyDataToSend, null, 2),
        network: activeNetwork,
      });
    }

    chatWs.send(
      JSON.stringify({
        message: messageText,
        ...(slyDataToSend ? { sly_data: slyDataToSend } : {}),
      })
    );
    setNewMessage("");
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };

  const textToSpeech = async (text: string, _index: number) => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/text_to_speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error("Failed to fetch audio");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load();
        await audioRef.current.play().catch((err) => {
          console.warn("Autoplay blocked, user must click Play:", err);
        });
      }
    } catch (error) {
      console.error("Error in textToSpeech:", error);
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });

      audioChunksRef.current = [];
      let mimeType = "audio/webm;codecs=opus";
      if (MediaRecorder.isTypeSupported("audio/wav")) mimeType = "audio/wav";
      else if (MediaRecorder.isTypeSupported("audio/webm;codecs=pcm"))
        mimeType = "audio/webm;codecs=pcm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        await saveRecording();
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Could not access microphone. Please check your permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const saveRecording = async () => {
    if (audioChunksRef.current.length === 0) return;

    try {
      setLoading(true);
      const actualMimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
      const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const mp3Blob = await convertToMp3(audioBuffer);
      await sendToSpeechToText(mp3Blob);
      audioContext.close();
    } catch (error) {
      console.error("Error in speech-to-text processing:", error);
      try {
        const actualMimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        await sendToSpeechToText(audioBlob);
      } catch (fallbackError) {
        console.error("Speech-to-text failed completely:", fallbackError);
        alert("Speech-to-text conversion failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const sendToSpeechToText = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.mp3");

      let response = await fetch(`${apiUrl}/api/v1/speech_to_text`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok && response.status === 400) {
        const alternativeNames = ["audio", "audio_file", "upload", "data"];
        for (const fieldName of alternativeNames) {
          const alt = new FormData();
          alt.append(fieldName, audioBlob, "recording.mp3");
          const altResponse = await fetch(`${apiUrl}/api/v1/speech_to_text`, {
            method: "POST",
            body: alt,
          });
          if (altResponse.ok) {
            response = altResponse;
            break;
          }
        }
      }

      if (!response.ok && response.status === 400) {
        const arr = await audioBlob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(arr)));
        const jsonResponse = await fetch(`${apiUrl}/api/v1/speech_to_text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_data: b64, format: "mp3" }),
        });
        if (jsonResponse.ok) response = jsonResponse;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
      }

      const result = await response.text();
      let transcribedText = "";
      try {
        const json = JSON.parse(result);
        transcribedText = json.text || json.transcription || result;
      } catch {
        transcribedText = result;
      }

      if (transcribedText && transcribedText.trim()) {
        const trimmedText = transcribedText.trim();
        setNewMessage(trimmedText);
        setShouldAutoPlayNextAgent(true);
        setTimeout(() => sendMessageWithText(trimmedText), 1000);
      }
    } catch (error) {
      console.error("Error calling speech-to-text API:", error);
      throw error;
    }
  };

  const convertToMp3 = async (audioBuffer: AudioBuffer): Promise<Blob> => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const left = audioBuffer.getChannelData(0);
    const right = numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;

    const leftInt16 = new Int16Array(left.length);
    const rightInt16 = new Int16Array(right.length);
    for (let i = 0; i < left.length; i++) {
      leftInt16[i] = Math.max(-32768, Math.min(32767, left[i] * 32768));
      rightInt16[i] = Math.max(-32768, Math.min(32767, right[i] * 32768));
    }

    const mp3encoder = new Mp3Encoder(numberOfChannels, sampleRate, 128);
    const mp3Data: Uint8Array[] = [];
    const sampleBlockSize = 1152;

    for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
      const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
      const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) mp3Data.push(mp3buf);

    return new Blob(mp3Data.map((c) => new Uint8Array(c)), { type: "audio/mp3" });
    };

  const downloadMessages = () => {
    const logText = chatMessages.map((msg) => `${msg.sender}: ${msg.text}`).join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chat_logs.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        backgroundColor: theme.palette.background.paper,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PanelGroup direction="vertical">
        {/* Panel 1: Header + Message List */}
        <Panel ref={messagePanelRef} defaultSize={75} minSize={30}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              p: 2,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
                pb: 1,
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: 600, color: theme.palette.text.primary }}
              >
                {title}
              </Typography>

              <Tooltip title="Download Messages">
                <IconButton
                  size="small"
                  onClick={downloadMessages}
                  sx={{
                    color: theme.palette.text.secondary,
                    "&:hover": {
                      color: theme.palette.primary.main,
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                >
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Scrollable Message Container */}
            <ScrollableMessageContainer
              messages={chatMessages}
              copiedMessage={copiedMessage}
              onCopy={copyToClipboard}
              onTextToSpeech={textToSpeech}
              useSpeech={useSpeech}
            />

            {/* Audio element for playback */}
            <Box
              sx={{
                mt: 0.5,
                pb: 0,
                pt: 0.5,
                borderTop: (t) => `1px solid ${t.palette.divider}`,
              }}
            >
              <audio ref={audioRef} controls style={{ width: "100%", height: "28px" }} />
            </Box>
          </Box>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle
          style={{
            height: "4px",
            backgroundColor: theme.palette.divider,
            cursor: "row-resize",
            transition: "background-color 0.2s ease",
          }}
        />

        {/* Panel 2: Inputs (chat) */}
        <Panel ref={inputPanelRef} defaultSize={25} minSize={15}>
          <div className="p-2 space-y-2 bg-[var(--chat-bg)]">
            {/* Chat controls */}
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1 }}>
              <Tooltip title="Clear Chat">
                <IconButton
                  size="small"
                  onClick={() => clearChat()}
                  sx={{
                    color: theme.palette.warning.main,
                    "&:hover": { backgroundColor: alpha(theme.palette.warning.main, 0.1) },
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Stop Chat">
                <IconButton
                  size="small"
                  onClick={() => stopWebSocket()}
                  sx={{
                    color: theme.palette.error.main,
                    "&:hover": { backgroundColor: alpha(theme.palette.error.main, 0.1) },
                  }}
                >
                  <StopIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Message input */}
            <Box sx={{ mt: 2, display: "flex", gap: 2, alignItems: "flex-end" }}>
              <TextField
                multiline
                minRows={2}
                maxRows={6}
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                sx={{
                  flexGrow: 1,
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: theme.palette.background.paper,
                    color: theme.palette.text.primary,
                    "&:hover": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: theme.palette.primary.main,
                      },
                    },
                    "&.Mui-focused": {
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: theme.palette.primary.main,
                        borderWidth: 2,
                      },
                    },
                  },
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: theme.palette.divider,
                  },
                }}
              />
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={sendMessage}
                  sx={{
                    backgroundColor: theme.palette.primary.main,
                    "&:hover": { backgroundColor: theme.palette.primary.dark },
                    minWidth: 80,
                  }}
                  startIcon={<SendIcon />}
                >
                  Send
                </Button>
                {useSpeech && (
                  <Tooltip
                    title={
                      loading
                        ? "Converting speech to text..."
                        : isRecording
                        ? "Recording... Release to stop"
                        : "Hold to record audio"
                    }
                  >
                    <IconButton
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onMouseLeave={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      disabled={loading}
                      sx={{
                        backgroundColor: loading
                          ? theme.palette.info.main
                          : isRecording
                          ? theme.palette.error.main
                          : theme.palette.primary.main,
                        color: "white",
                        "&:hover": {
                          backgroundColor: loading
                            ? theme.palette.info.dark
                            : isRecording
                            ? theme.palette.error.dark
                            : theme.palette.primary.dark,
                        },
                        "&.Mui-disabled": {
                          backgroundColor: theme.palette.action.disabled,
                          color: theme.palette.action.disabled,
                        },
                      }}
                    >
                      <MicIcon
                        sx={{
                          animation: loading
                            ? "spin 1s linear infinite"
                            : isRecording
                            ? "pulse 1s ease-in-out infinite"
                            : "none",
                          "@keyframes spin": {
                            "0%": { transform: "rotate(0deg)" },
                            "100%": { transform: "rotate(360deg)" },
                          },
                          "@keyframes pulse": {
                            "0%, 100%": { opacity: 1 },
                            "50%": { opacity: 0.5 },
                          },
                        }}
                      />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>

            {/* NEW: Always-visible "Use Sly Data" toggle below the message box */}
            <Box sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={useSlyDataChecked}
                    onChange={(e) => setUseSlyDataChecked(e.target.checked)}
                    size="small"
                    disableRipple
                    sx={{
                      p: 0.25,
                      "& .MuiSvgIcon-root": {
                        fontSize: 20,
                      },
                    }}
                  />
                }
                label="Use Edited Sly Data"
                sx={{
                  color: theme.palette.text.primary,
                  m: 0,
                  "& .MuiFormControlLabel-label": {
                    fontSize: 14,
                 },
                }}
              />
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, ml: 1 }}>
                (Current sly data from SlyData tab or {`{}`} if empty).
              </Typography>
            </Box>
          </div>
        </Panel>
      </PanelGroup>
    </Paper>
  );
};

export default ChatPanel;
