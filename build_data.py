import argparse
import html
import json
import re
from pathlib import Path


VIDEO_ID_PATTERN = re.compile(r"\[([A-Za-z0-9_-]{11})\]")
TIMESTAMP_PATTERN = re.compile(
    r"^\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+"
    r"(?:\d{2}:)?\d{2}:\d{2}\.\d{3}(?:\s+.*)?$"
)
TAG_PATTERN = re.compile(r"<[^>]*>")

SubtitleRecord = dict[str, str | float]
VideoIndex = dict[str, str | list[SubtitleRecord]]


def timestamp_to_seconds(timestamp: str) -> float:
    time_part, milliseconds = timestamp.split(".")
    time_components = [int(part) for part in time_part.split(":")]
    if len(time_components) == 2:
        minutes, seconds = time_components
        hours = 0
    else:
        hours, minutes, seconds = time_components
    return hours * 3600 + minutes * 60 + seconds + int(milliseconds) / 1000


def clean_caption_text(text: str) -> str:
    text = TAG_PATTERN.sub(" ", html.unescape(text))
    return " ".join(text.split())


def parse_vtt(content: str) -> list[SubtitleRecord]:
    cues = []
    lines = content.lstrip("\ufeff").splitlines()

    index = 0
    while index < len(lines):
        match = TIMESTAMP_PATTERN.match(lines[index])
        if match is None:
            index += 1
            continue

        text_lines = []
        index += 1
        while index < len(lines) and lines[index].strip():
            text_lines.append(lines[index])
            index += 1

        text = clean_caption_text("\n".join(text_lines))
        if text:
            cues.append(
                {
                    "s": timestamp_to_seconds(match.group(1)),
                    "t": text,
                }
            )

    if not cues:
        raise ValueError("No se encontraron subtítulos con texto en formato WebVTT.")
    return cues


def process_subtitle_file(path: Path) -> VideoIndex:
    video_match = VIDEO_ID_PATTERN.search(path.name)
    if video_match is None:
        raise ValueError(f"No se encontró un ID de YouTube en el nombre: {path.name}")

    title = path.name[: video_match.start()].strip()
    if not title:
        raise ValueError(f"No se encontró un título en el nombre: {path.name}")

    cues = parse_vtt(path.read_text(encoding="utf-8-sig"))
    return {
        "i": video_match.group(1),
        "t": title,
        "s": cues,
    }


def build_index(input_dir: Path) -> dict[str, list[VideoIndex]]:
    subtitle_files = sorted(input_dir.glob("*.vtt"))
    if not subtitle_files:
        raise ValueError(f"No se encontraron archivos .vtt en {input_dir}")

    videos = []
    for path in subtitle_files:
        videos.append(process_subtitle_file(path))
    return {"v": videos}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Genera un índice JSON agrupado por vídeo a partir de archivos WebVTT."
    )
    parser.add_argument("--input-dir", type=Path, default=Path("data"))
    parser.add_argument("--output", type=Path, default=Path("catala-al-natural.json"))
    args = parser.parse_args()

    if not args.input_dir.is_dir():
        parser.error(f"El directorio de entrada no existe: {args.input_dir}")

    try:
        records = build_index(args.input_dir)
        args.output.write_text(
            json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
    except (OSError, ValueError) as error:
        parser.error(str(error))

    subtitle_count = sum(len(video["s"]) for video in records["v"])
    print(
        f"Generated {subtitle_count} subtitle records across "
        f"{len(records['v'])} videos in {args.output}"
    )


if __name__ == "__main__":
    main()
