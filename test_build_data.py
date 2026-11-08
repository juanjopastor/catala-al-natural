import json
import tempfile
import unittest
from pathlib import Path

from build_data import build_index, parse_vtt, process_subtitle_file


class ParseVttTests(unittest.TestCase):
    def test_parses_multiline_cues_and_decodes_entities_and_markup(self):
        cues = parse_vtt(
            "WEBVTT\n\n"
            "00:00:01.250 --> 00:00:02.500 align:start\n"
            "<i>Bon dia</i> a\n"
            "tothom &amp; amics\n\n"
            "00:02.500 --> 00:03.000\n"
            "Adéu.\n"
        )

        self.assertEqual(cues[0]["s"], 1.25)
        self.assertEqual(cues[0]["t"], "Bon dia a tothom & amics")
        self.assertNotIn("processedText", cues[0])
        self.assertEqual(cues[1]["s"], 2.5)


class ProcessSubtitleFileTests(unittest.TestCase):
    def test_adds_video_metadata_and_next_subtitle_for_phrase_search(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Vídeo d'aprenentatge [Abcdefghijk].ca.vtt"
            path.write_text(
                "WEBVTT\n\n"
                "00:00:01.000 --> 00:00:02.000\n"
                "L’avi va—lent, l·lengua\n\n"
                "00:00:02.000 --> 00:00:03.000\n"
                "segona part!\n",
                encoding="utf-8",
            )

            video = process_subtitle_file(path)

        self.assertEqual(video["i"], "Abcdefghijk")
        self.assertEqual(video["t"], "Vídeo d'aprenentatge")
        subtitles = video["s"]
        self.assertEqual(len(subtitles), 2)
        self.assertEqual(set(subtitles[0]), {"s", "t"})
        self.assertEqual(subtitles[0]["s"], 1.0)
        self.assertEqual(subtitles[0]["t"], "L’avi va—lent, l·lengua")
        self.assertNotIn("processedText", subtitles[0])
        self.assertNotIn("nextSubOffset", subtitles[0])

    def test_build_index_combines_subtitle_files(self):
        with tempfile.TemporaryDirectory() as directory:
            input_dir = Path(directory)
            (input_dir / "Un vídeo [Abcdefghijk].ca.vtt").write_text(
                "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHola\n",
                encoding="utf-8",
            )

            index = build_index(input_dir)

        self.assertEqual(len(index["v"]), 1)
        self.assertEqual(index["v"][0]["s"][0]["t"], "Hola")
        serialized = json.loads(json.dumps(index))
        self.assertEqual(serialized["v"][0]["i"], "Abcdefghijk")


if __name__ == "__main__":
    unittest.main()
