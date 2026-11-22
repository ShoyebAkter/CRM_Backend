"""Local speech-to-text using faster-whisper.

Usage: python transcribe_local.py <audio file> [language code or empty] [model name]
Prints one JSON line to stdout: {"text": "...", "language": "bn"} or {"error": "..."}.

Install once:  pip install faster-whisper
The model (for example "small" or "medium") is downloaded automatically the first time.
"""
import json
import sys


def stamp(seconds):
    seconds = int(seconds)
    return "%02d:%02d" % (seconds // 60, seconds % 60)


def decode_audio(path, rate=16000):
    """Read any audio/video file as 16 kHz mono float32, skipping damaged packets.

    Phone recordings (for example Android .mp4/.m4a files) often have a damaged first
    packet. The decoder built into faster-whisper stops at the first bad packet and
    returns silence, so we decode packet by packet ourselves.
    """
    import av
    import numpy as np

    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=rate)
    chunks = []
    with av.open(path, mode="r") as container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            return np.zeros(0, dtype=np.float32)
        for packet in container.demux(stream):
            try:
                frames = packet.decode()
            except Exception:  # noqa: BLE001 - skip a damaged packet and keep going
                continue
            for frame in frames:
                frame.pts = None
                for out in resampler.resample(frame):
                    chunks.append(out.to_ndarray().reshape(-1))
        try:
            for out in resampler.resample(None):
                chunks.append(out.to_ndarray().reshape(-1))
        except Exception:  # noqa: BLE001
            pass
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file given."}))
        return

    path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
    model_name = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else "small"

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "faster-whisper is not installed. Open Command Prompt and run: pip install faster-whisper"}))
        return

    try:
        audio = decode_audio(path)
        if len(audio) < 16000 * 0.5:
            print(json.dumps({"error": "Could not read any audio from this file. Check that the recording has sound and is not damaged."}))
            return

        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments, info = model.transcribe(audio, language=language, vad_filter=True, beam_size=5)
        lines = []
        for seg in segments:
            text = seg.text.strip()
            if text:
                lines.append("[%s] %s" % (stamp(seg.start), text))

        if not lines:
            print(json.dumps({"error": "No speech was detected in this recording. It may be silent or too quiet. Try choosing the language (Bangla) instead of auto-detect."}))
            return
        print(json.dumps({"text": "\n".join(lines), "language": info.language}, ensure_ascii=False))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": "Could not transcribe: %s" % str(e)[:400]}))


if __name__ == "__main__":
    main()
