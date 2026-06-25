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

import { useEffect, useRef, useState } from "react";

export interface AttachedFile {
  file: File;
  content: string;
  isPdf: boolean;
  previewUrl?: string; // Blob URL for PDF preview
}

export interface StoredAttachedFile {
  file: File;
  content: string;
  previewUrl?: string;
}

export interface PdfProcessingResult {
  /** Text to append to the outgoing message (extracted PDF text, or a "failed" notice). */
  appendText: string;
  /** Files to attach to the user's chat message bubble (carries previewUrl for later viewing). */
  filesForStorage: StoredAttachedFile[];
}

export const useFileAttachments = (apiUrl: string) => {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke blob URLs only on unmount — viewed-in-history files need them to remain valid.
  useEffect(() => {
    return () => {
      attachedFiles.forEach((af) => {
        if (af.previewUrl) URL.revokeObjectURL(af.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPicker = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const isPdf = file.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          const previewUrl = URL.createObjectURL(file);
          setAttachedFiles((prev) => [...prev, { file, content: "", isPdf: true, previewUrl }]);
        } else {
          const text = await file.text();
          setAttachedFiles((prev) => [...prev, { file, content: text, isPdf: false }]);
        }
      } catch (err) {
        console.error(`Failed to read file ${file.name}:`, err);
      }
    }
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const removeAttachedFile = (index: number) => {
    const fileToRemove = attachedFiles[index];
    if (fileToRemove?.previewUrl) URL.revokeObjectURL(fileToRemove.previewUrl);
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAttachments = () => setAttachedFiles([]);

  /**
   * Build the message addendum for a send: inlines text-file content and POSTs PDFs
   * to /api/v1/process_pdfs for extraction. Returns the text to append and the files
   * to attach to the chat-message bubble for in-history viewing.
   */
  const prepareForSend = async (): Promise<PdfProcessingResult> => {
    let appendText = "";

    const textFiles = attachedFiles.filter((af) => !af.isPdf);
    if (textFiles.length > 0) {
      appendText = textFiles.map((af) => `--- ${af.file.name} ---\n${af.content}`).join("\n\n");
    }

    const pdfFiles = attachedFiles.filter((af) => af.isPdf);
    if (pdfFiles.length > 0) {
      try {
        const formData = new FormData();
        pdfFiles.forEach((af) => formData.append("files", af.file));
        const response = await fetch(`${apiUrl}/api/v1/process_pdfs`, {
          method: "POST",
          body: formData,
        });
        if (response.ok) {
          const result = await response.json();
          if (result.extracted_texts && Array.isArray(result.extracted_texts)) {
            const pdfContents = result.extracted_texts
              .map((text: string, idx: number) => `--- ${pdfFiles[idx].file.name} ---\n${text}`)
              .join("\n\n");
            appendText = appendText ? `${appendText}\n\n${pdfContents}` : pdfContents;
          }
        } else {
          console.error("Failed to process PDFs:", response.statusText);
          const fallback = pdfFiles
            .map((af) => `--- ${af.file.name} (PDF processing failed) ---`)
            .join("\n");
          appendText = appendText ? `${appendText}\n\n${fallback}` : fallback;
        }
      } catch (error) {
        console.error("Error processing PDFs:", error);
      }
    }

    const filesForStorage: StoredAttachedFile[] = attachedFiles.map((af) => ({
      file: af.file,
      content: af.content,
      previewUrl: af.previewUrl,
    }));

    return { appendText, filesForStorage };
  };

  return {
    attachedFiles,
    fileInputRef,
    openPicker,
    handleFileSelected,
    removeAttachedFile,
    clearAttachments,
    prepareForSend,
  };
};
