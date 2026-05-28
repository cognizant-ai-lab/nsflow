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

import { useRef, useCallback } from "react";
import { useApiPort } from "../context/ApiPortContext";

export const useTextToSpeech = () => {
  const { apiUrl } = useApiPort();
  const audioRef = useRef<HTMLAudioElement>(null);

  const textToSpeech = useCallback(async (text: string) => {
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
      throw error;
    }
  }, [apiUrl]);

  return { textToSpeech, audioRef };
};

