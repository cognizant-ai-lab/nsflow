
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
  
  // Flag to track when microphone was used for auto-play
  const [shouldAutoPlayNextAgent, setShouldAutoPlayNextAgent] = useState(false);
  // Keep track of the last message count to detect new agent messages
  const lastMessageCountRef = useRef(0);

  useEffect(() => {
    // Auto-scroll to latest message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Auto-play agent responses when microphone was used
  useEffect(() => {
    // Only proceed if we should auto-play and there are messages
    if (shouldAutoPlayNextAgent && chatMessages.length > 0) {
      // Check if this is a new message (message count increased)
      const currentMessageCount = chatMessages.length;
      const previousMessageCount = lastMessageCountRef.current;
      
      console.log('=== AUTO-PLAY DEBUG ===');
      console.log('Should auto-play:', shouldAutoPlayNextAgent);
      console.log('Current message count:', currentMessageCount);
      console.log('Previous message count:', previousMessageCount);
      console.log('Is new message?', currentMessageCount > previousMessageCount);
      
      // Only auto-play if this is a NEW message (count increased)
      if (currentMessageCount > previousMessageCount) {
        const lastMessage = chatMessages[chatMessages.length - 1];
        console.log('Last message sender:', lastMessage.sender);
        console.log('Last message text:', lastMessage.text.substring(0, 50) + '...');
        
        // Check if the last message is from an agent
        if (lastMessage.sender === "agent") {
          console.log('NEW AGENT MESSAGE - Auto-playing!');
          console.log('Full message text being sent to TTS:', lastMessage.text);
          
          // Reset the flag immediately to prevent multiple triggers
          setShouldAutoPlayNextAgent(false);
          
          // Update the message count ref
          lastMessageCountRef.current = currentMessageCount;
          
          // Store the current message text to ensure we're playing the right one
          const messageToPlay = lastMessage.text;
          const messageIndex = chatMessages.length - 1;
          
          // Call textToSpeech directly with the agent's message
          setTimeout(() => {
            console.log('Calling textToSpeech with text:', messageToPlay.substring(0, 50) + '...');
            console.log('Using message index:', messageIndex);
            textToSpeech(messageToPlay, messageIndex);
          }, 100); // Small delay to ensure the component is ready
        } else {
          console.log('Last message is not from agent, skipping auto-play');
          // Update the message count ref anyway
          lastMessageCountRef.current = currentMessageCount;
        }
      } else {
        console.log('No new message detected, skipping auto-play');
      }
    } else {
      // Update the message count ref even when not auto-playing
      lastMessageCountRef.current = chatMessages.length;
    }
  }, [chatMessages, shouldAutoPlayNextAgent]);

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

    addChatMessage({ sender: "user", text: messageText, network: activeNetwork });
    if (parsedSlyData) {
      addSlyDataMessage({ sender: "user", text: JSON.stringify(parsedSlyData, null, 2), network: activeNetwork });
    }    
    chatWs.send(JSON.stringify({
      message: messageText,
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
    console.log('=== TEXT-TO-SPEECH FUNCTION ===');
    console.log('Text to speech called for message:', text.substring(0, 50) + '...');
    console.log('Message index:', index);
    console.log('Full text being processed:', text);
    
    // TODO: Implement text-to-speech functionality here
    try {
      const response = await fetch("http://127.0.0.1:8005/api/v1/text_to_speech", {
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
      console.log('Converting audio to MP3 for speech-to-text...');
      setLoading(true);
      
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
      
      // Send MP3 to speech-to-text API
      await sendToSpeechToText(mp3Blob);
      
      // Clean up
      audioContext.close();
      
      console.log('Speech-to-text processing completed');
      
    } catch (error) {
      console.error('Error in speech-to-text processing:', error);
      
      // Fallback: try to send original format to API
      try {
        const actualMimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        await sendToSpeechToText(audioBlob);
        console.log('Speech-to-text completed with original format');
      } catch (fallbackError) {
        console.error('Speech-to-text failed completely:', fallbackError);
        alert('Speech-to-text conversion failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const sendToSpeechToText = async (audioBlob: Blob) => {
    try {
      console.log('Sending audio to speech-to-text API...');
      console.log('Audio blob details:', {
        size: audioBlob.size,
        type: audioBlob.type
      });
      
      // First try with just 'file' field name (most common)
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.mp3');
      
      console.log('FormData entries:');
      for (let [key, value] of formData.entries()) {
        console.log(key, value);
      }
      
      // Send to speech-to-text endpoint
      let response = await fetch('http://127.0.0.1:8005/api/v1/speech_to_text', {
        method: 'POST',
        body: formData,
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      // If first attempt fails, try alternative field names
      if (!response.ok && response.status === 400) {
        console.log('First attempt failed, trying alternative field names...');
        
        const alternativeNames = ['audio', 'audio_file', 'upload', 'data'];
        
        for (const fieldName of alternativeNames) {
          console.log(`Trying field name: ${fieldName}`);
          
          const altFormData = new FormData();
          altFormData.append(fieldName, audioBlob, 'recording.mp3');
          
          const altResponse = await fetch('http://127.0.0.1:8005/api/v1/speech_to_text', {
            method: 'POST',
            body: altFormData,
          });
          
          console.log(`Response for ${fieldName}:`, altResponse.status);
          
          if (altResponse.ok) {
            response = altResponse;
            console.log(`Success with field name: ${fieldName}`);
            break;
          } else {
            const errorText = await altResponse.text();
            console.log(`Failed with ${fieldName}:`, errorText);
          }
        }
      }
      
      // If all FormData attempts fail, try sending as JSON with base64
      if (!response.ok && response.status === 400) {
        console.log('All FormData attempts failed, trying JSON with base64...');
        
        try {
          // Convert blob to base64
          const arrayBuffer = await audioBlob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const base64String = btoa(String.fromCharCode(...uint8Array));
          
          const jsonResponse = await fetch('http://127.0.0.1:8005/api/v1/speech_to_text', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audio_data: base64String,
              format: 'mp3'
            }),
          });
          
          console.log('JSON response status:', jsonResponse.status);
          
          if (jsonResponse.ok) {
            response = jsonResponse;
            console.log('Success with JSON/base64 format');
          }
        } catch (jsonError) {
          console.log('JSON attempt also failed:', jsonError);
        }
      }

      if (!response.ok) {
        // Get error details from the last response
        const errorText = await response.text();
        console.error('All attempts failed. Final API Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
      }
      
      // Get the response text
      const result = await response.text();
      console.log('Speech-to-text response:', result);
      
      // Parse the response - it might be JSON or plain text
      let transcribedText = '';
      try {
        const jsonResult = JSON.parse(result);
        transcribedText = jsonResult.text || jsonResult.transcription || result;
      } catch {
        // If it's not JSON, use the raw text
        transcribedText = result;
      }
      
      // Place the transcribed text in the message input box
      if (transcribedText && transcribedText.trim()) {
        const trimmedText = transcribedText.trim();
        setNewMessage(trimmedText);
        console.log('Transcribed text placed in message input:', trimmedText);
        
        // Set flag to auto-play the next agent response
        console.log('Setting shouldAutoPlayNextAgent to true after microphone usage');
        setShouldAutoPlayNextAgent(true);
        
        // Add a small delay so user can see the transcribed text before it's sent
        setTimeout(() => {
          // Automatically send the message directly with the transcribed text
          sendMessageWithText(trimmedText);
        }, 1000); // 1 second delay to show the transcribed text
      } else {
        console.warn('No transcribed text received from API');
      }
      
    } catch (error) {
      console.error('Error calling speech-to-text API:', error);
      throw error; // Re-throw so the calling function can handle it
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
                    loading
                      ? 'bg-blue-600 text-white cursor-not-allowed'
                      : isRecording 
                      ? 'bg-red-600 text-white' 
                      : 'chat-send-btn'
                  }`}
                  title={
                    loading
                      ? "Converting speech to text..."
                      : isRecording 
                      ? "Recording... Release to stop" 
                      : "Hold to record audio"
                  }
                  disabled={loading}
                >
                  <Mic size={16} className={loading ? 'animate-spin' : isRecording ? 'animate-pulse' : ''} />
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
