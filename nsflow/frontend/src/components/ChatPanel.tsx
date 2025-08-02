
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
import { useState, useEffect, useRef } from "react";
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelHandle } from "react-resizable-panels";

import { FaDownload, FaRegStopCircle } from "react-icons/fa";
import { ImBin2 } from "react-icons/im";
import { Mic } from "lucide-react";
import { useChatControls } from "../hooks/useChatControls";
import { useChatContext } from "../context/ChatContext";
import ScrollableMessageContainer from "./ScrollableMessageContainer";
import { Mp3Encoder } from "@breezystack/lamejs";



const ChatPanel = ({ title = "Chat" }: { title?: string }) => {
  const { activeNetwork, chatMessages, addChatMessage, addSlyDataMessage, chatWs } = useChatContext();
  const { stopWebSocket, clearChat } = useChatControls();
  const [newMessage, setNewMessage] = useState("");
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputPanelRef = useRef<ImperativePanelHandle>(null);
  const messagePanelRef = useRef<ImperativePanelHandle>(null);

  // sly_data enablers
  const [enableSlyData, setEnableSlyData] = useState(false);
  const {newSlyData, setNewSlyData} = useChatContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ADD audioRef here
  const audioRef = useRef<HTMLAudioElement>(null);

  // Recording state and refs
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    if (!chatWs || chatWs.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected. Unable to send message.");
      return;
    }
    let parsedSlyData: Record<string, any> | undefined;

    if (newSlyData.trim()) {
      try {
        const parsed = JSON.parse(newSlyData);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
          parsedSlyData = parsed;
        }
      } catch (err) {
        console.warn("Invalid sly_data JSON. It will not be sent.");
      }
    }

    addChatMessage({ sender: "user", text: newMessage, network: activeNetwork });
    if (parsedSlyData) {
      addSlyDataMessage({ sender: "user", text: JSON.stringify(parsedSlyData, null, 2), network: activeNetwork });
    }    
    chatWs.send(JSON.stringify({
      message: newMessage,
      ...(parsedSlyData ? { sly_data: parsedSlyData } : {})
    }));
    setNewMessage("");
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessage(index);
      setTimeout(() => setCopiedMessage(null), 1000);
    });
  };
  
  const textToSpeech = async (text: string, index: number) => {

    // Handler called when speaker icon is clicked
    console.log('Text to speech clicked for message:', text);
    console.log('Message index:', index);
    
    // TODO: Implement text-to-speech functionality here
    try {
      const response = await fetch("http://127.0.0.1:8080/api/v1/text_to_speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text }), // your string input
      });

      if (!response.ok) {
        throw new Error("Failed to fetch audio");
      } else{
        console.log('Successfully fetched audio');
      }

      // Convert response to audio blob
      const blob = await response.blob();
      console.log("Received blob type:", blob.type);

      const url = URL.createObjectURL(blob);

      // Assign to <audio> element and play
      if (audioRef.current) {
        audioRef.current.src = url;
        
        // Explicitly load audio before playing
        audioRef.current.load();

        // Play inside user gesture context
        await audioRef.current.play().catch(err => {
          console.warn("Autoplay blocked, user must click Play:", err);
        });
      } else {
        console.log("autoRef.current is False");
      }
    } catch (error) {
      console.error("Error in textToSpeech:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const startRecording = async () => {
    try {
      console.log('Starting audio recording...');
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      // Reset audio chunks
      audioChunksRef.current = [];
      
      // Create MediaRecorder instance with better format for MP3 conversion
      let mimeType = 'audio/webm;codecs=opus'; // fallback
      if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
        mimeType = 'audio/webm;codecs=pcm';
      }
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Set up data collection
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Handle recording completion
      mediaRecorder.onstop = async () => {
        console.log('Recording stopped, processing audio...');
        await saveRecording();
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };
      
      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    console.log('Stopping audio recording...');
    
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const saveRecording = async () => {
    if (audioChunksRef.current.length === 0) {
      console.log('No audio data to save');
      return;
    }

    try {
      console.log('Converting audio to MP3...');
      
      // Determine the actual mime type used for recording
      const actualMimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      console.log('Recorded format:', actualMimeType);
      
      // Create blob from recorded chunks
      const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
      
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Create audio context for processing
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Decode audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Convert to MP3
      const mp3Blob = await convertToMp3(audioBuffer);
      
      // Create download link
      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.mp3`;
      
      // Trigger download
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up
      URL.revokeObjectURL(url);
      audioContext.close();
      
      console.log('Recording saved as MP3');
      
    } catch (error) {
      console.error('Error converting to MP3:', error);
      
      // Fallback: save as original format
      const actualMimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
      const url = URL.createObjectURL(audioBlob);
      const a = document.createElement('a');
      a.href = url;
      const extension = actualMimeType.includes('wav') ? 'wav' : 'webm';
      a.download = `recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${extension}`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('Saved as WebM (MP3 conversion failed)');
    }
  };

  const convertToMp3 = async (audioBuffer: AudioBuffer): Promise<Blob> => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    console.log(`Converting audio: ${numberOfChannels} channels, ${sampleRate} Hz, ${audioBuffer.length} samples`);
    
    const left = audioBuffer.getChannelData(0);
    const right = numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    
    // Convert float32 to int16
    const leftInt16 = new Int16Array(left.length);
    const rightInt16 = new Int16Array(right.length);
    
    for (let i = 0; i < left.length; i++) {
      leftInt16[i] = Math.max(-32768, Math.min(32767, left[i] * 32768));
      rightInt16[i] = Math.max(-32768, Math.min(32767, right[i] * 32768));
    }
    
    // Initialize MP3 encoder
    console.log('Initializing MP3 encoder...');
    const mp3encoder = new Mp3Encoder(numberOfChannels, sampleRate, 128); // 128 kbps
    console.log('MP3 encoder initialized successfully');
    
    const mp3Data = [];
    const sampleBlockSize = 1152; // Must be multiple of 576
    
    // Encode in chunks
    for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
      const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
      const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
      
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    
    // Flush remaining data
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
    
    console.log(`MP3 encoding complete. Generated ${mp3Data.length} chunks`);
    
    // Create blob
    const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
    console.log(`MP3 blob created: ${mp3Blob.size} bytes`);
    return mp3Blob;
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

  const toggleSlyData = () => {
    const isEnabling = !enableSlyData;
    setEnableSlyData(isEnabling);
  
    if (isEnabling) {
      requestAnimationFrame(() => {
        // Expand the input panel to 40%
        inputPanelRef.current?.resize(40);
        messagePanelRef.current?.resize(60);
      })
    } else {
      // Collapse back to original layout
      inputPanelRef.current?.resize(25);
      messagePanelRef.current?.resize(75);
    }
  };
  

  return (
    <div className="chat-panel h-full w-full">
      <PanelGroup direction="vertical">
        {/* Panel 1: Header + Message List */}
        <Panel ref={messagePanelRef} defaultSize={75} minSize={30}>
          <div className="flex flex-col h-full p-4 overflow-hidden">
            {/* Header */}
            <div className="logs-header flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold">{title}</h2>
              <button
                onClick={downloadMessages}
                className="logs-download-btn hover:text-white p-1"
                title="Download Messages"
              >
                <FaDownload size={18} />
              </button>
            </div>

            {/* Scrollable Message Container */}
            <ScrollableMessageContainer
              messages={chatMessages}
              copiedMessage={copiedMessage}
              onCopy={copyToClipboard}
              onTextToSpeech={textToSpeech}
            />

            {/* Audio element for playback */}
            <div className="mt-2">
              <audio ref={audioRef} controls className="w-full" />
            </div>

          </div>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="bg-gray-700 h-1 cursor-row-resize" />

        {/* Panel 2: Inputs (chat + sly_data) */}
        <Panel ref={inputPanelRef} defaultSize={25} minSize={15}>
          <div className="p-4 space-y-2 bg-[var(--chat-bg)]">
            {/* Chat controls */}
            <div className="flex justify-end space-x-4 mt-1">
              <button
                onClick={clearChat}
                className="logs-download-btn bg-white-700 hover:bg-orange-400 text-white p-1 rounded-md"
                title="Clear Chat"
              >
                <ImBin2 size={12} />
              </button>
              <button
                onClick={stopWebSocket}
                className="chat-stop-btn bg-white-700 hover:bg-red-500 text-white p-1 rounded-md"
                title="Stop Chat"
              >
                <FaRegStopCircle size={12} />
              </button>
            </div>

            {/* Message input */}
            <div className="chat-input mt-2 flex gap-2 items-end">
              <textarea
                placeholder="Type a message..."
                className="chat-input-box"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={sendMessage}
                  className="chat-send-btn"
                >
                  Send
                </button>
                <button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className={`flex items-center justify-center p-2 rounded-md transition-colors ${
                    isRecording 
                      ? 'bg-red-600 text-white' 
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white'
                  }`}
                  title={isRecording ? "Recording... Release to stop" : "Hold to record audio"}
                  disabled={loading}
                >
                  <Mic size={16} className={isRecording ? 'animate-pulse' : ''} />
                </button>
              </div>
            </div>
            <div
              onClick={toggleSlyData}
              className="sly-data-btn flex items-center cursor-pointer text-sm text-white mb-1"
            >
              <span className="mr-1 hover:text-orange-400 transition-colors duration-100">
                {enableSlyData ? "▼" : "▶"} sly_data
              </span>
            </div>

            {/* Sly Data*/}
            <div
              className={`collapsible ${enableSlyData ? "open" : "closed"}`}
            >
              <div className="sly-data-section mt-2 w-full">
                <hr className="my-1 border-t border-gray-600" />
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="sly-data-attach-btn"
                  >
                    Attach sly_data
                  </button>
                  <span className="text-xs text-gray-400">Supported: .json, .txt, .hocon</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.txt,.hocon"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setNewSlyData(ev.target?.result as string);
                      };
                      reader.readAsText(file);
                    }}
                  />
                </div>

                <textarea
                  className="w-full h-32 p-2 bg-gray-800 text-white rounded-md text-sm font-mono"
                  placeholder="Enter or edit sly_data here..."
                  value={newSlyData}
                  onChange={(e) => setNewSlyData(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default ChatPanel;
