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
  "videos": [
    {
      "videoId": "Abcdefghijk",
      "title": "Video title",
      "subtitles": [
        {
          "start": 1.25,
          "text": "Subtitle text",
          "processedText": "subtitle text next cue",
          "nextSubOffset": 13
        }
      ]
    }
  ]
}
```

Each video has a `videoId`, a `title`, and a `subtitles` array. Each subtitle
contains:

- `start`: start time in seconds.
- `text`: subtitle text without WebVTT tags.
- `processedText`: lowercase text without punctuation, except apostrophes,
  hyphens, and the middle dot in `l·l`. It also includes the processed text
  from the next subtitle to support phrase searches across subtitles.
- `nextSubOffset`: length of the current subtitle's processed text in UTF-16
  code units, as used by JavaScript. A match belongs to this entry only if its
  starting index in `processedText` is less than this value.

Existing flat indexes are still supported. Regenerate them with
`build_data.py` to remove repeated video metadata and reduce their file size.

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
