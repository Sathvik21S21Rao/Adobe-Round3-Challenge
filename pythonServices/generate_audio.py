import os
import wave
import requests
from dotenv import load_dotenv
from pydub import AudioSegment
from pydub.utils import which

# Gemini
from google import genai
from google.genai import types

load_dotenv()

# Initialize Gemini client only if needed
client = None
if os.getenv("TTS_PROVIDER", "gemini").lower() == "gemini":
    client = genai.Client()

def generate_gemini_podcast(conversation, output_file="podcast.wav"):
    """
    Generate a multi-speaker podcast audio file from a conversation list.
    conversation = [("kore", "line1"), ("enceladus", "line2"), ...]
    """

    # Build script for Gemini
    script = "\n".join([f"{speaker.capitalize()}: {line}" for speaker, line in conversation])

    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents=f"TTS the following conversation:\n{script}",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                    speaker_voice_configs=[
                        types.SpeakerVoiceConfig(
                            speaker="Kore",
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="kore")
                            ),
                        ),
                        types.SpeakerVoiceConfig(
                            speaker="Enceladus",
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="enceladus")
                            ),
                        ),
                    ]
                )
            ),
        ),
    )

    # Extract audio data (raw PCM 16-bit mono @ 24kHz)
    data = response.candidates[0].content.parts[0].inline_data.data

    # Save to wav file
    with wave.open(output_file, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(24000)
        f.writeframes(data)

    print(f"Podcast saved to {output_file}")


def _generate_azure_tts(text, output_file, voice="alloy"):
    """Generate audio using Azure OpenAI TTS."""
    api_key = os.getenv("AZURE_TTS_KEY")
    endpoint = os.getenv("AZURE_TTS_ENDPOINT")
    deployment = os.getenv("AZURE_TTS_DEPLOYMENT", "tts")

    api_version = os.getenv("AZURE_TTS_API_VERSION", "2025-03-01-preview")

    if not api_key or not endpoint:
        raise ValueError("AZURE_TTS_KEY and AZURE_TTS_ENDPOINT must be set for Azure OpenAI TTS")

    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
    }

    payload = {
        "model": deployment,
        "input": text,
        "voice": voice,
    }

    try:
        response = requests.post(
            f"{endpoint}/openai/deployments/{deployment}/audio/speech?api-version={api_version}",
            headers=headers,
            json=payload,
            timeout=30,
        )
        response.raise_for_status()

        with open(output_file, "wb") as f:
            f.write(response.content)

        return output_file

    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Azure OpenAI TTS failed: {e}")


def synthesize_azure(text, voice):
    """Wrapper to return AudioSegment from Azure OpenAI TTS."""
    temp_file = "temp.wav"
    _generate_azure_tts(text, temp_file, voice=voice)
    return AudioSegment.from_wav(temp_file)


def generate_azure_podcast(conversation, output_file="podcast.mp3"):
    speaker_voices = {
        "kore": "alloy",     
        "enceladus": "echo",  
    }

    final_track = AudioSegment.silent(1000)
    for speaker, text in conversation:
        audio_segment = synthesize_azure(text, speaker_voices[speaker])
        final_track += audio_segment + AudioSegment.silent(400)

    export_audio(final_track, output_file)


def export_audio(audio: AudioSegment, output_file: str):
    if which("ffmpeg"):
        audio.export(output_file, format="mp3")
        print(f"🎧 Podcast saved as {output_file} (MP3)")
    else:
        wav_file = output_file.replace(".mp3", ".wav")
        audio.export(wav_file, format="wav")
        print(f"⚠️ ffmpeg not found. Saved as {wav_file} (WAV instead).")


def generate_podcast(conversation, output_file="podcast.mp3"):
    backend = os.getenv("TTS_PROVIDER", "gemini").lower()

    if backend == "gemini":
        return generate_gemini_podcast(conversation, output_file)
    elif backend == "azure":
        return generate_azure_podcast(conversation, output_file)
    else:
        raise NotImplementedError(f"Backend '{backend}' is not implemented yet.")


