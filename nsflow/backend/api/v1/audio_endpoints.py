# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# END COPYRIGHT
import logging
import os
import tempfile
from io import BytesIO

import speech_recognition as sr
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from gtts import gTTS
from pydantic import BaseModel
from pydub import AudioSegment

router = APIRouter(prefix="/api/v1")

# Constants
MIN_AUDIO_BYTES = 100  # Minimum file size for valid audio


def detect_audio_format_and_suffix(content_type: str) -> tuple[str, str]:
    """Detect audio format and file suffix from content type.

    Args:
        content_type: The MIME content type of the audio file

    Returns:
        Tuple of (audio_format, file_suffix)
    """
    content_type_lower = content_type.lower()
    if "webm" in content_type_lower:
        return "webm", ".webm"
    if "wav" in content_type_lower:
        return "wav", ".wav"
    if "ogg" in content_type_lower:
        return "ogg", ".ogg"
    if "m4a" in content_type_lower or "mp4" in content_type_lower:
        return "mp4", ".m4a"
    return "mp3", ".mp3"  # default


def load_audio_segment(file_path: str, audio_format: str) -> tuple[AudioSegment | None, str | None]:
    """Load audio file with fallback methods.

    Args:
        file_path: Path to the audio file
        audio_format: Expected audio format (e.g., 'mp3', 'webm', 'wav')

    Returns:
        Tuple of (AudioSegment or None, error_message or None)
    """
    audio_segment = None
    conversion_error = None

    # Try with specific format first
    try:
        audio_segment = AudioSegment.from_file_using_temporary_files(file_path, format=audio_format)
        return audio_segment, None
    except Exception as e1:
        logging.warning("Failed to load audio as %s: %s", audio_format, str(e1))
        conversion_error = str(e1)

    # Try generic loading
    try:
        audio_segment = AudioSegment.from_file_using_temporary_files(file_path)
        logging.info("Loaded audio using generic format detection")
        return audio_segment, None
    except Exception as e2:
        logging.error("Failed to load audio generically: %s", str(e2))
        conversion_error += "; " + str(e2)

    # For webM, try treating it as raw file
    if audio_format == "webm":
        try:
            audio_segment = AudioSegment.from_file(
                file_path,
                format="raw",
                frame_rate=48000,
                channels=1,
                sample_width=2,
            )
            logging.info("Loaded webM audio as raw format")
            return audio_segment, None
        except Exception as e3:
            logging.error("Failed to load webM audio as raw: %s", str(e3))
            conversion_error += "; " + str(e3)

    return None, conversion_error


def preprocess_audio(audio_segment: AudioSegment, audio_format: str) -> AudioSegment:
    """Apply audio preprocessing for better speech recognition.

    Applies normalization, mono conversion, resampling to 16kHz,
    and volume boost for webM format.

    Args:
        audio_segment: The loaded AudioSegment
        audio_format: The original audio format (e.g., 'webm', 'mp3')

    Returns:
        Processed AudioSegment ready for speech recognition
    """
    logging.info("Applying audio preprocessing for better speech recognition...")

    # Normalize audio
    processed_audio = audio_segment.normalize()

    # Convert to mono if stereo
    if processed_audio.channels > 1:
        processed_audio = processed_audio.set_channels(1)
        logging.info("Converted audio to mono")

    # Resample to 16kHz (optimal for speech recognition)
    if processed_audio.frame_rate != 16000:
        processed_audio = processed_audio.set_frame_rate(16000)

    # Boost volume for webM
    if audio_format == "webm":
        processed_audio = processed_audio + 10  # increase volume by 10dB

    return processed_audio


def log_audio_properties(audio_segment: AudioSegment) -> float:
    """Log audio properties and return duration in seconds.

    Args:
        audio_segment: The loaded AudioSegment

    Returns:
        Duration in seconds
    """
    duration_seconds = len(audio_segment) / 1000.0
    logging.info(
        "Audio duration: %.2f seconds, channels: %d, frame_rate: %d",
        duration_seconds,
        audio_segment.channels,
        audio_segment.frame_rate,
    )
    return duration_seconds


class TextToSpeechRequest(BaseModel):
    text: str


@router.post("/speech_to_text")
async def speech_to_text(audio: UploadFile = File(...)):
    """
    Convert speech from an MP3 file to text using Google Speech Recognition.

    Args:
        audio: MP3 audio file to transcribe

    Returns:
        JSON response containing the transcribed text

    To test the endpoint with curl

    curl -X POST \
        -F "audio=@audio.mp3;type=audio/mpeg" \
        http://127.0.0.1:8005/api/v1/speech_to_text
    """
    try:
        # Validate file type
        if not audio.content_type or not audio.content_type.startswith("audio/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Please upload an audio file.")

        logging.info("Received audio file: %s, content-type: %s", audio.filename, audio.content_type)

        # Read file content

        content = await audio.read()

        # validate content
        file_size = len(content)
        logging.info("Audio file size: %d bytes", file_size)

        if file_size < MIN_AUDIO_BYTES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Audio file is too small or empty ({file_size} bytes) "
                    "please ensure microphone permission is granted and try recording again."
                )
            )
        # Detect audio format from content type
        audio_format, file_suffix = detect_audio_format_and_suffix(audio.content_type)
        logging.info("Detected audio format: %s", audio_format)
        # Create a temporary file to save the uploaded audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_suffix) as temp_audio:
            temp_audio.write(content)
            temp_audio_path = temp_audio.name

        try:
            # Initialize the recognizer
            recognizer = sr.Recognizer()

            # Convert MP3 to WAV format that speech_recognition can handle
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_wav:
                temp_wav_path = temp_wav.name

            # Load audio using pydub with fallback methods
            audio_segment, conversion_error = load_audio_segment(temp_audio_path, audio_format)
            if audio_segment is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not process audio file. Errors: {conversion_error}",
                )
            # Log audio properties
            duration_seconds = log_audio_properties(audio_segment)
            if duration_seconds < 0.5:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Audio file is too short ({duration_seconds:.2f} seconds). "
                        "Please provide a longer audio."
                    ),
                )
            # Apply audio preprocessing and export
            processed_audio = preprocess_audio(audio_segment, audio_format)
            processed_audio.export(temp_wav_path, format="wav")

            # Load the audio file
            with sr.AudioFile(temp_wav_path) as source:
                # adjust for ambient noise
                recognizer.adjust_for_ambient_noise(source, duration=0.5)
                audio_data = recognizer.record(source)

            # Use Google Speech Recognition
            transcribed_text = recognizer.recognize_google(
                audio_data,
                language="en-US",
                show_all=False #return best match only
                )

            logging.info("Transcription successful: %.50s...", transcribed_text)

            return JSONResponse(content={"text": transcribed_text})

        except sr.UnknownValueError as exc:
            logging.warning("Google Speech Recognition could not understand the audio")
            raise HTTPException(status_code=400, detail="Could not understand the audio") from exc
        except sr.RequestError as exc:
            logging.error("Google Speech Recognition service error: %s", exc)
            raise HTTPException(status_code=503, detail="Speech recognition service unavailable") from exc
        finally:
            # Clean up temporary files
            # TEMPORARILY enable FOR DEBUGGING - Keep files for manual inspection
            # logging.info("DEBUG: Temporary files kept for inspection:")
            # logging.info("  Original audio: %s", temp_audio_path)
            # logging.info("  Processed WAV: %s", temp_wav_path)
            try:# disable deletion for debugging if needed and enable logging above
                os.unlink(temp_audio_path)
                os.unlink(temp_wav_path)
            except OSError:
                pass

    except Exception as exc:
        logging.error("Error in speech_to_text: %s", exc)
        raise HTTPException(status_code=500, detail=f"Speech-to-text processing failed: {str(exc)}") from exc


@router.post("/text_to_speech")
async def text_to_speech(request: TextToSpeechRequest):
    """
    Convert text to speech and return an MP3 file using Google Text-to-Speech.

    Args:
        request: JSON object containing the text to convert

    Returns:
        MP3 audio file containing the synthesized speech

    To test the endpoint with curl

    curl -X POST \
        -H "Content-Type: application/json" \
        -d '{"text": "Convert text to speech"}' \
        http://127.0.0.1:8005/api/v1/text_to_speech \
        --output audio.mp3
    """
    try:
        text = request.text
        if not text or not text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty.")

        logging.info("Received text for TTS: %.50s...", text)

        # Create gTTS object
        tts = gTTS(text=text, lang="en", slow=False)

        # Create a BytesIO object to store the audio
        audio_buffer = BytesIO()

        # Save the audio to the buffer
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)

        logging.info("Generated MP3 audio successfully")

        # Return the audio as a streaming response
        return StreamingResponse(
            BytesIO(audio_buffer.read()),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=speech.mp3"},
        )

    except Exception as exc:
        logging.error("Error in text_to_speech: %s", exc)
        raise HTTPException(status_code=500, detail=f"Text-to-speech processing failed: {str(exc)}") from exc


# Dependencies required: pip install gtts speechrecognition pydub
