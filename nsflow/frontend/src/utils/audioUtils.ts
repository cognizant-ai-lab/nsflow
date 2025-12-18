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

import { Mp3Encoder } from "@breezystack/lamejs";

export const convertToMp3 = async (audioBuffer: AudioBuffer): Promise<Blob> => {
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

