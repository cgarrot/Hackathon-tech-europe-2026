from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from gameforge_gradium.gateway import GradiumVoiceGateway
from gameforge_voice.contracts import AiUtterance, PlayerUtterance, StopSignal, VoiceProfile, VoiceRuntimeConfig
from gameforge_voice.styles import apply_gradium_text_controls, gradium_json_config


STT_SAMPLE_RATE = 24_000
STT_FRAME_SAMPLES = 1_920
TTS_SAMPLE_RATE = 48_000
TTS_FRAME_SAMPLES = 3_840


class GradiumVoiceProvider:
    """Gradium-backed push-to-talk STT and streaming TTS provider."""

    def __init__(
        self,
        config: VoiceRuntimeConfig,
        gateway: Optional[GradiumVoiceGateway] = None,
    ) -> None:
        self.config = config
        self.gateway = gateway or GradiumVoiceGateway()
        self.client = self.gateway._client()

    async def start(self) -> None:
        return None

    async def listen_player_turn(
        self,
        player_id: str,
        wait_for_stop: Optional[StopSignal] = None,
    ) -> PlayerUtterance:
        sounddevice = _sounddevice()
        loop = asyncio.get_running_loop()
        audio_queue: asyncio.Queue[bytes] = asyncio.Queue()

        def callback(indata: bytes, frames: int, time_info: Any, status: Any) -> None:
            if status:
                print(f"[audio input] {status}")
            loop.call_soon_threadsafe(audio_queue.put_nowait, bytes(indata))

        json_config: Dict[str, Any] = {"language": self.config.language}
        kwargs: Dict[str, Any] = {
            "model_name": self.config.stt_model,
            "input_format": "pcm",
            "json_config": json_config,
        }
        transcript_parts: List[str] = []
        raw_messages: List[Dict[str, Any]] = []

        async with self.client.stt_realtime(**kwargs) as stt:
            if wait_for_stop is None:
                if self.config.terminal_prompts:
                    if self.config.language == "en":
                        print("Speak now. Press Enter to send your turn.")
                    else:
                        print("Parle maintenant. Appuie sur Entree pour envoyer ton tour.")
                wait_for_stop = _wait_for_enter

            stop_task = asyncio.create_task(wait_for_stop())

            async def producer() -> None:
                with sounddevice.RawInputStream(
                    samplerate=STT_SAMPLE_RATE,
                    channels=1,
                    dtype="int16",
                    blocksize=STT_FRAME_SAMPLES,
                    callback=callback,
                ):
                    while not stop_task.done():
                        try:
                            chunk = await asyncio.wait_for(audio_queue.get(), timeout=0.1)
                        except asyncio.TimeoutError:
                            continue
                        await stt.send_audio(chunk)

                    await stt.send_flush(flush_id=1)
                    await stt.send_eos()

            async def consumer() -> None:
                async for msg in stt:
                    raw_messages.append(msg)
                    msg_type = msg.get("type")
                    if msg_type == "text":
                        text = msg.get("text", "")
                        if text:
                            transcript_parts.append(text)
                            if self.config.terminal_prompts:
                                print(text, end=" ", flush=True)
                    elif msg_type == "end_of_stream":
                        return

            try:
                await asyncio.wait_for(
                    asyncio.gather(producer(), consumer()),
                    timeout=self.config.max_record_seconds + 5,
                )
            except asyncio.TimeoutError as exc:
                await stt.send_eos()
                raise RuntimeError("Recording timed out before Gradium finished the turn.") from exc

        if self.config.terminal_prompts:
            print()
        text = " ".join(part.strip() for part in transcript_parts if part.strip()).strip()
        return PlayerUtterance(
            player_id=player_id,
            text=text,
            language=self.config.language,
            raw={"messages": raw_messages},
        )

    async def speak_ai(self, utterance: AiUtterance, profile: VoiceProfile) -> None:
        sounddevice = _sounddevice()
        json_config = gradium_json_config(utterance.speech_style)
        setup = {
            "model_name": self.config.tts_model,
            "voice_id": profile.voice_id,
            "output_format": "pcm",
        }
        if json_config:
            setup["json_config"] = json_config

        stream = await self.client.tts_stream(
            setup=setup,
            text=apply_gradium_text_controls(utterance.text, utterance.speech_style),
        )

        with sounddevice.RawOutputStream(
            samplerate=TTS_SAMPLE_RATE,
            channels=1,
            dtype="int16",
            blocksize=TTS_FRAME_SAMPLES,
        ) as output:
            async for chunk in stream.iter_bytes():
                output.write(chunk)

    async def stop(self) -> None:
        return None


def _sounddevice() -> Any:
    try:
        import sounddevice
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing sounddevice. Run `uv pip install .` and make sure the virtualenv is active."
        ) from exc
    return sounddevice


async def _wait_for_enter() -> None:
    await asyncio.to_thread(input)
