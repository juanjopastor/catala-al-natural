# catala-al-natural

## Generate the subtitle index

The `build_data.py` script processes the `.vtt` files in the `data` directory
and generates `catala-al-natural.json` in the project root:

```powershell
python build_data.py
```

You can specify different input and output paths:

```powershell
python build_data.py --input-dir path\to\subtitles --output path\to\channel.json
```

The JSON groups subtitles by video, so each video ID and title is stored once:

```json
{
  "v": [
    {
      "i": "Abcdefghijk",
      "t": "Video title",
      "s": [
        {
          "s": 1.25,
          "t": "Subtitle text"
        }
      ]
    }
  ]
}
```

The compact fields are `v` (videos), `i` (video ID), `t` (title), and `s`
(subtitles on a video; start time in seconds on a subtitle). Each subtitle
contains:

- `s`: start time in seconds.
- `t`: subtitle text without WebVTT tags.

The browser also accepts existing indexes using the previous descriptive field
names.

The browser generates the normalized search text and subtitle-boundary offsets
in memory when a channel index is first loaded. They are reused for subsequent
searches and are not stored in the JSON file.

Run the tests with:

```powershell
python -m unittest
```

## Use the web search

Generate `catala-al-natural.json` if it does not exist, then serve the project
from the repository root:

```powershell
python build_data.py
python -m http.server 8000
```

Open `http://localhost:8000` in your browser. The selected channel's index is
loaded on the first search. Do not open `index.html` directly as a file, since
the browser will not allow the page to load the JSON files that way.
Results are displayed 20 per page.

## Channels

The `channels.json` file defines the available channels. Each entry in
`channels` has a display name (`name`) and a path to its index (`file`):

```json
{
  "channels": [
    {
      "name": "català al natural",
      "file": "catala-al-natural.json"
    }
  ]
}
```

To add a channel, create its JSON index and add an entry to `channels`. The
selector lets users switch channels, and each index is loaded the first time
they search that channel.
