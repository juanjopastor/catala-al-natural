import json
import tempfile
import unittest
from pathlib import Path

from build_data import build_index, normalize_text, parse_vtt, process_subtitle_file


class NormalizeTextTests(unittest.TestCase):
    def test_removes_symbols_and_preserves_catalan_apostrophes_and_hyphens(self):
        self.assertEqual(
            normalize_text("L’avi va—lent; l·lengua &amp; bé!"),
            "l'avi va-lent l·lengua amp bé",
        )


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

        self.assertEqual(cues[0]["start"], 1.25)
        self.assertEqual(cues[0]["text"], "Bon dia a tothom & amics")
        self.assertEqual(cues[0]["processedText"], "bon dia a tothom amics")
        self.assertEqual(cues[1]["start"], 2.5)


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

            records = process_subtitle_file(path)

        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["videoId"], "Abcdefghijk")
        self.assertEqual(records[0]["title"], "Vídeo d'aprenentatge")
        self.assertEqual(records[0]["start"], 1.0)
        self.assertEqual(records[0]["text"], "L’avi va—lent, l·lengua")
        self.assertEqual(
            records[0]["processedText"],
            "l'avi va-lent l·lengua segona part",
        )
        self.assertEqual(
            records[0]["nextSubOffset"],
            len("l'avi va-lent l·lengua"),
        )
        self.assertEqual(records[1]["processedText"], "segona part")

    def test_build_index_combines_subtitle_files(self):
        with tempfile.TemporaryDirectory() as directory:
            input_dir = Path(directory)
            (input_dir / "Un vídeo [Abcdefghijk].ca.vtt").write_text(
                "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHola\n",
                encoding="utf-8",
            )

            records = build_index(input_dir)

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["processedText"], "hola")
        self.assertEqual(json.loads(json.dumps(records))[0]["videoId"], "Abcdefghijk")


if __name__ == "__main__":
    unittest.main()
