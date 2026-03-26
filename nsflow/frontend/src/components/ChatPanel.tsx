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
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  CircularProgress,
} from "@mui/material";
import {
  Download as DownloadIcon,
  StopCircle as StopIcon,
  Delete as DeleteIcon,
  Mic as MicIcon,
  Send as SendIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
  InsertDriveFile as FileIcon,
  WarningAmber as WarningAmberIcon,
} from "@mui/icons-material";
import { useApiPort } from "../context/ApiPortContext";
import { useChatControls } from "../hooks/useChatControls";
import { useChatContext } from "../context/ChatContext";
import { getFeatureFlags } from "../utils/config";
import { useTheme } from "../context/ThemeContext";
import { useNeuroSan } from "../context/NeuroSanContext";
import ScrollableMessageContainer from "./ScrollableMessageContainer";
import { Mp3Encoder } from "@breezystack/lamejs";

// NEW: use cache + converter to source sly_data from the editor
import { useSlyDataCache } from "../hooks/useSlyDataCache";

const ChatPanel = ({ title = "Chat" }: { title?: string }) => {
  const { apiUrl } = useApiPort();
  const { theme } = useTheme();
  const { viteUseSpeech } = getFeatureFlags();
  const useSpeech = !!viteUseSpeech 
  // Use for Dev:
  // import.meta.env.VITE_USE_SPEECH === "true";

  const {
    activeNetwork,
    targetNetwork,
    chatMessages,
    slyDataMessages,
    addChatMessage,
    addSlyDataMessage,
    chatWs,
    isEditorMode,
  } = useChatContext();

  const { stopWebSocket, clearChat } = useChatControls();

  const [newMessage, setNewMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [sampleQueries, setSampleQueries] = useState<string[]>([]);
  const [sampleQueriesExpanded, setSampleQueriesExpanded] = useState(true);

  const [attachedFiles, setAttachedFiles] = useState<{ 
    file: File; 
    content: string; 
    isPdf: boolean;
    previewUrl?: string; // Blob URL for PDF preview
  }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewingFile, setViewingFile] = useState<{ 
    file: File; 
    content: string; 
    isPdf?: boolean;
    previewUrl?: string;
  } | null>(null);

  // Network loader state (editor mode only)
  const { connectionType, host, port, isNsReady } = useNeuroSan();
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [waitingForAgent, setWaitingForAgent] = useState(false);
  const [selectedLoadNetwork, setSelectedLoadNetwork] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputPanelRef = useRef<ImperativePanelHandle>(null);
  const messagePanelRef = useRef<ImperativePanelHandle>(null);

  // NEW: cache reader to get current editor data
  const { loadSlyDataFromCache, saveSlyDataToCache, clearSlyDataCache } = useSlyDataCache();

  const slyTogglePrefix = isEditorMode ? 'nsflow-editor-use-slydata' : 'nsflow-use-slydata';
  const slyToggleGlobalKey = slyTogglePrefix;
  const slyToggleNetworkKey = useMemo(() => {
    const network = targetNetwork || activeNetwork;
    return network ? `${slyTogglePrefix}-${network}` : null;
  }, [targetNetwork, activeNetwork, slyTogglePrefix]);

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
        const v = localStorage.getItem(`${slyTogglePrefix}-${network}`);
        if (v != null) return v === 'true';
      }
      const g = localStorage.getItem(slyTogglePrefix);
      if (g != null) return g === 'true';
    } catch {}
    return false;
  };
  // NEW: "Use Sly Data" checkbox state — always false in editor mode (no cache persistence)
  const [useSlyDataChecked, setUseSlyDataChecked] = useState<boolean>(() => isEditorMode ? false : readSlyToggle(targetNetwork || activeNetwork));

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Clear waitingForAgent when an agent message arrives
  useEffect(() => {
    if (waitingForAgent && chatMessages.length > 0) {
      const last = chatMessages[chatMessages.length - 1];
      if (last.sender === "agent") {
        setWaitingForAgent(false);
      }
    }
  }, [chatMessages, waitingForAgent]);

  // Clear waitingForAgent if websocket closes or disconnects
  useEffect(() => {
    if (!waitingForAgent || !chatWs) return;
    if (chatWs.readyState === WebSocket.CLOSED || chatWs.readyState === WebSocket.CLOSING) {
      setWaitingForAgent(false);
      return;
    }
    const handleClose = () => setWaitingForAgent(false);
    const handleError = () => setWaitingForAgent(false);
    chatWs.addEventListener('close', handleClose);
    chatWs.addEventListener('error', handleError);
    return () => {
      chatWs.removeEventListener('close', handleClose);
      chatWs.removeEventListener('error', handleError);
    };
  }, [waitingForAgent, chatWs]);

  // Cleanup blob URLs only when component unmounts (not on every file change)
  useEffect(() => {
    return () => {
      // Cleanup on unmount only
      attachedFiles.forEach(af => {
        if (af.previewUrl) {
          URL.revokeObjectURL(af.previewUrl);
        }
      });
    };
  }, []);

  // Fetch connectivity info and extract sample queries when network changes
  // Use targetNetwork (Editor page) or activeNetwork (Home page)
  useEffect(() => {
    const fetchSampleQueries = async () => {
      const network = targetNetwork || activeNetwork;
      if (!network || !apiUrl) {
        setSampleQueries([]);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/connectivity/${network}`);
        if (!response.ok) {
          console.error("Failed to fetch connectivity info:", response.statusText);
          setSampleQueries(["What all can you help us with?"]);
          return;
        }

        const data = await response.json();
        const queries = data?.metadata?.sample_queries || [];

        // Always append the default query
        const allQueries = [...queries, "What all can you help us with?"];
        setSampleQueries(allQueries);
      } catch (error) {
        console.error("Error fetching sample queries:", error);
        setSampleQueries(["What all can you help us with?"]);
      }
    };

    fetchSampleQueries();
  }, [targetNetwork, activeNetwork, apiUrl]);

  // Load persisted toggle when network changes (or first mount) — skip in editor mode
  useEffect(() => {
    if (isEditorMode) return;
    // when network changes, prefer its stored setting if present
    const network = targetNetwork || activeNetwork;
    const stored = readSlyToggle(network);
    setUseSlyDataChecked(stored);
  }, [targetNetwork, activeNetwork, isEditorMode]);

  // Persist on change — skip in editor mode
  useEffect(() => {
    if (isEditorMode) return;
    try {
      if (slyToggleNetworkKey) {
        localStorage.setItem(slyToggleNetworkKey, String(useSlyDataChecked));
      }
      localStorage.setItem(slyToggleGlobalKey, String(useSlyDataChecked));
    } catch {}
  }, [useSlyDataChecked, slyToggleNetworkKey, isEditorMode]);

  // Fetch available networks for editor dropdown
  useEffect(() => {
    if (!isEditorMode || !isNsReady || !apiUrl) return;
    const fetchNetworks = async () => {
      setLoadingNetworks(true);
      try {
        const params = new URLSearchParams();
        if (connectionType) params.set("connection_type", connectionType);
        if (host) params.set("host", host);
        if (port) params.set("port", String(port));
        const response = await fetch(`${apiUrl}/api/v1/list?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (response.ok) {
          const data = await response.json();
          const names: string[] = (data.agents || []).map((a: any) => a.agent_name);
          setAvailableNetworks(names);
        }
      } catch (e) {
        console.error("Failed to fetch network list for editor:", e);
      } finally {
        setLoadingNetworks(false);
      }
    };
    fetchNetworks();
  }, [isEditorMode, isNsReady, apiUrl, connectionType, host, port]);

  // Handler for loading an existing network into the editor (or clearing on X)
  const handleLoadNetwork = useCallback(async (networkName: string | null) => {
    const network = targetNetwork || activeNetwork;

    setSelectedLoadNetwork(networkName);

    if (!networkName) {
      // User clicked X to clear — reset to "design from scratch" mode.
      if (!isEditorMode) {
        // Write directly to localStorage (React setState + useEffect won't flush before reload).
        if (slyToggleNetworkKey) {
          localStorage.setItem(slyToggleNetworkKey, 'false');
        }
        localStorage.setItem(slyToggleGlobalKey, 'false');
        clearSlyDataCache(network || undefined);
      }
      window.location.reload();
      return;
    }

    if (!apiUrl) return;
    setLoadingDefinition(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/network_definition/${encodeURIComponent(networkName)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error("Failed to load network definition:", errData.detail || response.statusText);
        return;
      }
      const payload = await response.json();
      const pretty = JSON.stringify(payload, null, 2);
      addSlyDataMessage({ sender: "user", text: `\`\`\`json\n${pretty}\n\`\`\``, network: network });
      if (!isEditorMode) {
        setUseSlyDataChecked(true);
      }
      setSampleQueriesExpanded(false);
      if (network && !isEditorMode) {
        saveSlyDataToCache(payload, network, 1);
      }
    } catch (e) {
      console.error("Error loading network definition:", e);
    } finally {
      setLoadingDefinition(false);
    }
  }, [apiUrl, targetNetwork, activeNetwork, addSlyDataMessage, saveSlyDataToCache, clearSlyDataCache, slyToggleNetworkKey, isEditorMode]);

  // Auto-load network from URL query param (e.g. /editor?loadNetwork=basic/hello_world)
  const [autoLoadHandled, setAutoLoadHandled] = useState(false);
  useEffect(() => {
    if (autoLoadHandled || !isEditorMode || loadingNetworks || !availableNetworks.length) return;
    const params = new URLSearchParams(window.location.search);
    const loadNetwork = params.get('loadNetwork');
    if (loadNetwork && availableNetworks.includes(loadNetwork)) {
      setAutoLoadHandled(true);
      // Clean the URL so reload doesn't re-trigger
      const url = new URL(window.location.href);
      url.searchParams.delete('loadNetwork');
      window.history.replaceState({}, '', url.toString());
      handleLoadNetwork(loadNetwork);
    } else {
      setAutoLoadHandled(true);
    }
  }, [isEditorMode, loadingNetworks, availableNetworks, autoLoadHandled, handleLoadNetwork]);

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

  // Build sly_data to send: editor mode reads from slyDataMessages, home mode reads from cache
  const getSlyDataForSend = useCallback((): Record<string, any> | undefined => {
    if (isEditorMode) {
      // In editor mode, always send current sly data from the messages stream (no cache, no checkbox)
      for (let i = (slyDataMessages ?? []).length - 1; i >= 0; i--) {
        const msg = slyDataMessages[i];
        const raw = typeof msg?.text === 'string' ? msg.text : undefined;
        if (!raw) continue;
        // Extract JSON from code-fenced or raw string
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const jsonStr = fence?.[1] ?? raw;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch { /* skip non-JSON messages */ }
      }
      return {}; // no sly data yet — still send empty object
    }
    // Home mode: use checkbox + cache
    if (!useSlyDataChecked) return undefined;
    const network = targetNetwork || activeNetwork;
    if (!network) return {};
    const cached = loadSlyDataFromCache(network);
    if (cached && cached.data && typeof cached.data === 'object' && !Array.isArray(cached.data) && Object.keys(cached.data).length > 0) {
      return cached.data;
    }
    return {};
  }, [isEditorMode, slyDataMessages, useSlyDataChecked, targetNetwork, activeNetwork, loadSlyDataFromCache]);

  const handleFileAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      try {
        const isPdf = file.name.toLowerCase().endsWith(".pdf");
        
        if (isPdf) {
          // For PDFs, create a blob URL for preview (no text content needed)
          const previewUrl = URL.createObjectURL(file);
          setAttachedFiles((prev) => [...prev, { 
            file, 
            content: "", // Empty content since we'll show PDF preview
            isPdf: true,
            previewUrl 
          }]);
        } else {
          // For text files (.txt, .md), read the content
          const text = await file.text();
          setAttachedFiles((prev) => [...prev, { 
            file, 
            content: text, 
            isPdf: false 
          }]);
        }
      } catch (err) {
        console.error(`Failed to read file ${file.name}:`, err);
      }
    }
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const removeAttachedFile = (index: number) => {
    // Revoke blob URL before removing
    const fileToRemove = attachedFiles[index];
    if (fileToRemove?.previewUrl) {
      URL.revokeObjectURL(fileToRemove.previewUrl);
    }
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const openFileViewer = (fileData: { file: File; content: string; isPdf?: boolean; previewUrl?: string }) => {
    setViewingFile(fileData);
  };

  const closeFileViewer = () => {
    setViewingFile(null);
  };

  const sendMessage = () => {
    if (!newMessage.trim() && attachedFiles.length === 0) return;
    // Reset auto-play flag for typed messages (not from microphone)
    setShouldAutoPlayNextAgent(false);
    sendMessageWithText(newMessage);
  };

  const sendMessageWithText = async (messageText: string) => {
    if (!messageText.trim() && attachedFiles.length === 0) return;
    if (!chatWs || chatWs.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected. Unable to send message.");
      return;
    }

    const slyDataToSend = getSlyDataForSend();
    const network = targetNetwork || activeNetwork;

    // Build the message for backend
    let fullMessageForBackend = messageText;
    
    // For text files, include content inline
    const textFiles = attachedFiles.filter(af => !af.isPdf);
    if (textFiles.length > 0) {
      const fileContents = textFiles
        .map((af) => `--- ${af.file.name} ---\n${af.content}`)
        .join("\n\n");
      fullMessageForBackend = fullMessageForBackend.trim()
        ? `${fullMessageForBackend}\n\n${fileContents}`
        : fileContents;
    }

    // For PDFs, we'll need to send them via an API endpoint first
    const pdfFiles = attachedFiles.filter(af => af.isPdf);
    if (pdfFiles.length > 0) {
      try {
        // Send PDFs to backend for processing
        const formData = new FormData();
        pdfFiles.forEach((af) => {
          formData.append('files', af.file);
        });

        const response = await fetch(`${apiUrl}/api/v1/process_pdfs`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          // Append extracted PDF text to the message
          if (result.extracted_texts && Array.isArray(result.extracted_texts)) {
            const pdfContents = result.extracted_texts
              .map((text: string, idx: number) => `--- ${pdfFiles[idx].file.name} ---\n${text}`)
              .join("\n\n");
            fullMessageForBackend = fullMessageForBackend.trim()
              ? `${fullMessageForBackend}\n\n${pdfContents}`
              : pdfContents;
          }
        } else {
          console.error("Failed to process PDFs:", response.statusText);
          // Fallback: mention the PDF files without content
          const pdfNames = pdfFiles
            .map((af) => `--- ${af.file.name} (PDF processing failed) ---`)
            .join("\n");
          fullMessageForBackend = fullMessageForBackend.trim()
            ? `${fullMessageForBackend}\n\n${pdfNames}`
            : pdfNames;
        }
      } catch (error) {
        console.error("Error processing PDFs:", error);
      }
    }

    // Store attached files WITH previewUrl so PDFs can be viewed later
    const filesForStorage = attachedFiles.map(af => ({
      file: af.file,
      content: af.content,
      previewUrl: af.previewUrl  // Keep the blob URL for viewing later
    }));

    addChatMessage({
      sender: "user",
      text: messageText,
      network: network,
      attachedFiles: filesForStorage,
    });

    if (slyDataToSend) {
      addSlyDataMessage({
        sender: "user",
        text: JSON.stringify(slyDataToSend, null, 2),
        network: network,
      });
    }

    // Send the full message (with file content) to backend
    chatWs.send(
      JSON.stringify({
        message: fullMessageForBackend,
        ...(slyDataToSend ? { sly_data: slyDataToSend } : {}),
      })
    );

    // DON'T clean up blob URLs here - they're needed for viewing files in sent messages
    // Blob URLs will be cleaned up when component unmounts
    
    setNewMessage("");
    setAttachedFiles([]);
    setWaitingForAgent(true);

    // Collapse sample queries section after sending message
    setSampleQueriesExpanded(false);
  };

  const handleSampleQueryClick = (query: string) => {
    // Reset auto-play flag for sample query clicks
    setShouldAutoPlayNextAgent(false);
    sendMessageWithText(query);
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
        <Panel ref={messagePanelRef} defaultSize={72} minSize={30}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              pt: 2,
              px: 2,
              pb: 0.5,
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
              onFileClick={openFileViewer}
            />

            {/* Audio element for playback with controls */}
            <Box
              sx={{
                mt: 0,
                pb: 0,
                pt: 0.5,
                borderTop: (t) => `1px solid ${t.palette.divider}`,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <audio ref={audioRef} controls style={{ flexGrow: 1, height: "24px" }} />

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
          </Box>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle
          style={{
            height: "2px",
            backgroundColor: theme.palette.divider,
            cursor: "row-resize",
            transition: "background-color 0.2s ease",
          }}
        />

        {/* Panel 2: Inputs (chat) */}
        <Panel ref={inputPanelRef} defaultSize={28} minSize={15}>
          <Box
            sx={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
          {/* Scrollable area: sample queries, files, message box, dropdown */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              pt: 0.5,
              px: 2,
              pb: 1,
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              // subtle scrollbar styling
              "&::-webkit-scrollbar": { width: 8 },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: alpha(theme.palette.text.primary, 0.2),
                borderRadius: 8
              },
              "&::-webkit-scrollbar-track": {
                backgroundColor: alpha(theme.palette.background.default, 0.4)
              }
            }}
          >
            {/* Sample Queries Section */}
            {sampleQueries.length > 0 && (
              <Box sx={{ position: 'relative' }}>
                <Box
                  onClick={() => setSampleQueriesExpanded(!sampleQueriesExpanded)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mb: 0,
                    cursor: 'pointer',
                    borderRadius: 1,
                    px: 0.5,
                    py: 0.2,
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    },
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: theme.palette.text.secondary,
                      fontSize: '0.6rem',
                      fontWeight: 500,
                      userSelect: 'none',
                    }}
                  >
                    Sample Queries
                  </Typography>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: theme.palette.text.secondary,
                    }}
                  >
                    {sampleQueriesExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                  </Box>
                </Box>
                {sampleQueriesExpanded && (
                  <Paper
                    elevation={1}
                    sx={{
                      p: 0.8,
                      backgroundColor: alpha(theme.palette.primary.main, 0.04),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                      borderRadius: 1
                    }}
                  >
                    {/* Scrollable queries area */}
                    <Box
                      sx={{
                        maxHeight: 48,
                        overflowY: "auto",
                        pr: 0.5,
                      // subtle scrollbar styling
                      "&::-webkit-scrollbar": { width: 8, height: 8 },
                      "&::-webkit-scrollbar-thumb": {
                        backgroundColor: alpha(theme.palette.text.primary, 0.2),
                        borderRadius: 8
                      },
                      "&::-webkit-scrollbar-track": {
                        backgroundColor: alpha(theme.palette.background.default, 0.4)
                      }
                    }}
                  >
                    <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5} alignItems="center">
                      {sampleQueries.map((query, index) => (
                        <Chip
                          key={`${query}-${index}`}
                          size="small"
                          variant="outlined"
                          label={query}
                          onClick={() => handleSampleQueryClick(query)}
                          sx={{
                            height: 20,
                            borderRadius: "16px",
                            cursor: "pointer",
                            "& .MuiChip-label": { px: 0.75, fontSize: "0.65rem" },
                            "&:hover": {
                              backgroundColor: alpha(theme.palette.primary.main, 0.1),
                              borderColor: theme.palette.primary.main,
                            },
                            transition: "background-color 120ms ease, border-color 120ms ease"
                          }}
                          title={`Click to send: "${query}"`}
                        />
                      ))}
                    </Stack>
                  </Box>
                  </Paper>
                )}
              </Box>
            )}

            {/* Attached files display */}
            {attachedFiles.length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {attachedFiles.map((af, index) => (
                  <Chip
                    key={`${af.file.name}-${index}`}
                    icon={<AttachFileIcon sx={{ fontSize: 14 }} />}
                    label={af.file.name}
                    size="small"
                    onClick={() => openFileViewer(af)}
                    onDelete={() => removeAttachedFile(index)}
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
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.md,.txt"
              multiple
              style={{ display: "none" }}
              onChange={handleFileSelected}
            />

            {/* Message input */}
            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
              {/* Message box wrapper with anchored attach icon */}
              <Box sx={{ flexGrow: 1, position: "relative" }}>
                <TextField
                  autoFocus
                  multiline
                  minRows={3}
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
                    width: "100%",
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: theme.palette.background.paper,
                      color: theme.palette.text.primary,
                      padding: "8px 12px 8px 8px",
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
                    "& .MuiInputBase-input": {
                      padding: "0 !important",
                    },
                    "& textarea": {
                      resize: "vertical",
                      padding: "0 !important",
                    },
                  }}
                />
                {/* Attach icon anchored inside the message box, top-right */}
                <Tooltip title="Attach file (.pdf, .md, .txt)">
                  <IconButton
                    size="small"
                    disabled={waitingForAgent}
                    onClick={handleFileAttach}
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      zIndex: 1,
                      width: 34,
                      height: 34,
                      color: '#4caf50',
                      backgroundColor: alpha('#4caf50', 0.12),
                      borderRadius: 1,
                      "&:hover": {
                        color: '#388e3c',
                        backgroundColor: alpha('#4caf50', 0.22),
                      },
                      "&.Mui-disabled": {
                        color: theme.palette.action.disabled,
                        backgroundColor: alpha(theme.palette.action.disabled, 0.08),
                      },
                    }}
                  >
                    <AttachFileIcon sx={{ fontSize: 28 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              {/* Right column: mic (top) + Send (bottom) */}
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
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
                    <span>
                      <IconButton
                        size="small"
                        aria-label="Record voice"
                        aria-pressed={isRecording ? "true" : "false"}
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onMouseLeave={stopRecording}
                        onTouchStart={startRecording}
                        onTouchEnd={stopRecording}
                        disabled={loading}
                        sx={{
                          width: 36,
                          height: 36,
                          color: loading
                            ? theme.palette.info.main
                            : isRecording
                            ? theme.palette.error.main
                            : theme.palette.primary.main,
                          borderRadius: 999,
                          // match Clear/Stop style: subtle alpha hover, no solid fill
                          "&:hover": {
                            backgroundColor: alpha(
                              loading
                                ? theme.palette.info.main
                                : isRecording
                                ? theme.palette.error.main
                                : theme.palette.primary.main,
                              0.1
                            ),
                          },
                          "&.Mui-disabled": {
                            color: theme.palette.action.disabled,
                          },
                        }}
                      >
                        <MicIcon
                          sx={{
                            fontSize: 24,
                            transition: "transform .15s ease, opacity .15s ease",
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
                              "50%": { opacity: 0.55 },
                            },
                          }}
                        />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}

                <Button
                  variant="contained"
                  disabled={waitingForAgent}
                  onClick={sendMessage}
                  sx={{
                    backgroundColor: theme.palette.primary.main,
                    "&:hover": { backgroundColor: theme.palette.primary.dark },
                    minWidth: 80,
                    minHeight: 48,
                  }}
                  startIcon={<SendIcon />}
                >
                  Send
                </Button>
              </Box>
            </Box>


          </Box>
          {/* END scrollable area */}

          {/* Fixed bottom: network loader + "Use Sly Data" toggle — always visible */}
          <Box sx={{ flexShrink: 0, px: 2, pt: 0.5, pb: 0.25, borderTop: `1px solid ${theme.palette.divider}` }}>
              {/* Network loader dropdown (editor mode only) */}
              {isEditorMode && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 'calc(80px + 32px)', mb: 0.5, minHeight: 36 }}>
                  <Autocomplete
                    size="small"
                    options={[...availableNetworks].sort((a, b) => {
                      const folderA = a.split('/').slice(0, -1).join('/');
                      const folderB = b.split('/').slice(0, -1).join('/');
                      if (folderA !== folderB) return folderA.localeCompare(folderB);
                      return a.localeCompare(b);
                    })}
                    groupBy={(option) => option.split('/').slice(0, -1).join('/') || ''}
                    loading={loadingNetworks || loadingDefinition}
                    value={selectedLoadNetwork}
                    disabled={waitingForAgent}
                    onChange={(_event, value) => handleLoadNetwork(value)}
                    renderGroup={(params) => (
                      <li key={params.key}>
                        {params.group && (
                          <Box
                            component="div"
                            sx={{
                              fontSize: 12,
                              fontWeight: 700,
                              lineHeight: '28px',
                              minHeight: 28,
                              pl: 1,
                              color: theme.palette.text.secondary,
                              position: 'sticky',
                              top: -4,
                              zIndex: 1,
                              backgroundColor: theme.palette.mode === 'dark' ? '#1a2e1e' : '#e8f5e9',
                            }}
                          >
                            {params.group}
                          </Box>
                        )}
                        <ul style={{ padding: 0 }}>{params.children}</ul>
                      </li>
                    )}
                    clearIcon={
                      <Tooltip title="Clearing this agent-network will reset the Editor to its default state">
                        <CloseIcon sx={{ fontSize: 18 }} />
                      </Tooltip>
                    }
                    slotProps={{
                      clearIndicator: {
                        sx: {
                          color: theme.palette.error.main,
                          backgroundColor: alpha(theme.palette.error.main, 0.1),
                          borderRadius: '50%',
                          width: 22,
                          height: 22,
                          transition: 'all 200ms ease',
                          '&:hover': {
                            backgroundColor: alpha(theme.palette.error.main, 0.22),
                            transform: 'scale(1.1)',
                            boxShadow: `0 2px 8px ${alpha(theme.palette.error.main, 0.3)}`,
                          },
                          '&:active': {
                            transform: 'scale(0.95)',
                          },
                        },
                      },
                      listbox: {
                        sx: {
                          py: 0.5,
                          '& .MuiAutocomplete-option': {
                            fontSize: 13,
                            minHeight: 28,
                            py: '2px',
                            pl: 3,
                            pr: 1,
                            backgroundColor: 'transparent',
                            '&[aria-selected="true"]': {
                              backgroundColor: alpha('#4caf50', 0.18),
                            },
                            '&.Mui-focused, &:hover': {
                              backgroundColor: alpha('#4caf50', 0.12),
                            },
                          },
                          '& .MuiAutocomplete-groupLabel': {
                            display: 'none',
                          },
                          '& .MuiAutocomplete-groupUl': {
                            backgroundColor: 'transparent',
                          },
                        },
                      },
                      paper: {
                        sx: {
                          backgroundColor: theme.palette.mode === 'dark'
                            ? '#1a2e1e'
                            : '#e8f5e9',
                          backdropFilter: 'blur(12px)',
                          border: `1px solid ${alpha('#4caf50', 0.25)}`,
                        },
                      },
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Load Existing Agent Network"
                        variant="outlined"
                        size="small"
                        slotProps={{
                          input: {
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {(loadingNetworks || loadingDefinition) && <CircularProgress size={16} />}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          },
                        }}
                      />
                    )}
                    sx={{
                      flex: 1,
                      '& .MuiOutlinedInput-root': {
                        fontSize: 13,
                        py: 0,
                        height: 26,
                      },
                      '& .MuiOutlinedInput-input': {
                        py: '2px !important',
                      },
                      '& .MuiInputLabel-root': {
                        fontSize: 11,
                        top: -5,
                      },
                      '& .MuiInputLabel-shrink': {
                        top: 0,
                      },
                    }}
                  />
                  <Tooltip
                    title={
                      <>
                        <strong>Editing existing Agent-Networks is an Experimental feature.</strong><br />
                        Works best for agent-networks that are "generated" by Agent Network Designer or agent-networks that do not have any python coded-tools.<br />
                        <strong>Caution!</strong> Editing might change the behavior of an Agent-Network.
                      </>
                    }
                    placement="right"
                    arrow
                  >
                    <WarningAmberIcon sx={{ fontSize: 16, color: '#ed6c02', cursor: 'help', flexShrink: 0 }} />
                  </Tooltip>
                </Box>
              )}
              {!isEditorMode && (
              <Box sx={{ display: "flex", alignItems: "center", mt: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={useSlyDataChecked}
                      onChange={(e) => setUseSlyDataChecked(e.target.checked)}
                      disabled={waitingForAgent}
                      disableRipple
                      sx={{
                        p: 0.25,
                        "& .MuiSvgIcon-root": {
                          fontSize: 22,
                        },
                      }}
                    />
                  }
                  label="Use Edited Sly Data"
                  sx={{
                    color: theme.palette.text.primary,
                    m: 0,
                    "& .MuiFormControlLabel-label": {
                      fontSize: 12,
                    },
                  }}
                />
                <Typography sx={{ color: theme.palette.text.secondary, ml: 1, fontSize: 11 }}>
                  (from SlyData tab or {`{}`} if empty)
                </Typography>
              </Box>
              )}
          </Box>
          </Box>
        </Panel>
      </PanelGroup>

      {/* File Viewer Dialog - with PDF iframe preview */}
      <Dialog
        open={!!viewingFile}
        onClose={closeFileViewer}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            maxHeight: "90vh",
            height: viewingFile?.isPdf ? "90vh" : "auto",
            backgroundColor: theme.palette.background.paper,
          }
        }}
      >
        <DialogTitle sx={{ 
          display: "flex", 
          alignItems: "center", 
          gap: 1,
          pb: 1,
          borderBottom: `1px solid ${theme.palette.divider}`
        }}>
          <FileIcon sx={{ color: theme.palette.primary.main }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {viewingFile?.file.name}
          </Typography>
          <IconButton onClick={closeFileViewer} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2, pb: 2, height: viewingFile?.isPdf ? "calc(90vh - 120px)" : "auto" }}>
          {viewingFile?.isPdf ? (
            <Box sx={{ 
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <iframe
                src={viewingFile.previewUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  borderRadius: '4px',
                }}
                title={`PDF Preview: ${viewingFile.file.name}`}
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
                  borderRadius: 8
                },
              }}
            >
              {viewingFile?.content}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeFileViewer} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ChatPanel;
