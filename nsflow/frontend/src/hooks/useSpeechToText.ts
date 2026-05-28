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

import { useState, useRef, useCallback } from "react";
import { useApiPort } from "../context/ApiPortContext";
import { convertToMp3 } from "../utils/audioUtils";

export const useSpeechToText = () => {
  const { apiUrl } = useApiPort();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
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
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Could not access microphone. Please check your permissions.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const processRecording = useCallback(async (): Promise<string> => {
    if (audioChunksRef.current.length === 0) {
      throw new Error("No audio recorded");
    }

    try {
      setIsProcessing(true);
      const actualMimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
      const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });

      // Try to convert to MP3
      let blobToSend = audioBlob;
      try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        blobToSend = await convertToMp3(audioBuffer);
        audioContext.close();
      } catch {
        // Fallback to original blob if conversion fails
        console.warn("MP3 conversion failed, using original audio format");
      }

      // Send to speech-to-text API
      const formData = new FormData();
      formData.append("audio", blobToSend, "recording.mp3");

      const response = await fetch(`${apiUrl}/api/v1/speech_to_text`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Speech-to-text failed");

      const result = await response.text();
      let transcribedText = "";
      try {
        const json = JSON.parse(result);
        transcribedText = json.text || json.transcription || result;
      } catch {
        transcribedText = result;
      }

      return transcribedText.trim();
    } catch (error) {
      console.error("Error processing recording:", error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [apiUrl]);

  return {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    processRecording,
  };
};

