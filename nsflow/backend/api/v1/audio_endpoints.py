# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# nsflow SDK Software in commercial settings.
#
# END COPYRIGHT
import logging
import os
import tempfile
from io import BytesIO

import speech_recognition as sr
from fastapi import APIRouter
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse
from gtts import gTTS
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/v1")


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

        # Create a temporary file to save the uploaded audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_audio:
            temp_audio.write(content)
            temp_audio_path = temp_audio.name

        try:
            # Initialize the recognizer
            recognizer = sr.Recognizer()

            # Convert MP3 to WAV format that speech_recognition can handle
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_wav:
                temp_wav_path = temp_wav.name

            # Use pydub to convert MP3 to WAV

            try:
                from pydub import AudioSegment  # pylint: disable=import-outside-toplevel

                audio_segment = AudioSegment.from_file_using_temporary_files(temp_audio_path, "mp3")
                audio_segment.export(temp_wav_path, format="wav")
            except ImportError as exc:
                raise HTTPException(
                    status_code=500, detail="pydub library not installed. Required for audio conversion."
                ) from exc

            # Load the audio file
            with sr.AudioFile(temp_wav_path) as source:
                audio_data = recognizer.record(source)

            # Use Google Speech Recognition
            transcribed_text = recognizer.recognize_google(audio_data)

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
            try:
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
