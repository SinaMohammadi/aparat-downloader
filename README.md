# Aparat Playlist Downloader

A fast, concurrent Node.js command-line tool for downloading entire video playlists from [Aparat](https://www.aparat.com) — Iran's largest video-sharing platform.

## Features

- **Concurrent downloads** — Download multiple videos in parallel (configurable, default: 4)
- **Live progress dashboard** — Real-time terminal UI showing per-slot progress bars, download speed, and file sizes
- **Automatic redirect handling** — Follows HTTP 301/302 redirects seamlessly
- **Connection pooling** — Uses HTTP/HTTPS keep-alive agents for efficient network usage
- **Safe filenames** — Generates clean, numbered filenames with Persian/Arabic character support
- **Resilient** — Gracefully handles missing download links, network errors, and skipped videos

## Requirements

- **Node.js** v14 or later
- No external dependencies — uses only built-in Node.js modules (`https`, `http`, `fs`, `path`)

## Installation

```bash
git clone https://github.com/SinaMohammadi/aparat-downloader.git
cd aparat-playlist-downloader
```

No `npm install` needed — the script has zero external dependencies.

## Usage

```bash
node aparat-downloader.js <playlist_id> [concurrency]
```

| Argument | Description | Default |
|---|---|---|
| `playlist_id` | The numeric ID of the Aparat playlist (required) | — |
| `concurrency` | Number of parallel downloads | `4` |

### Examples

```bash
# Download a playlist with default concurrency (4 parallel downloads)
node aparat-downloader.js 123456

# Download with 8 parallel downloads
node aparat-downloader.js 123456 8
```

### Finding the Playlist ID

The playlist ID is the numeric value found in the Aparat playlist URL:

```
https://www.aparat.com/playlist/123456
                               ^^^^^^
                            playlist_id
```

## Output

Videos are saved to a folder named `playlist_<playlist_id>/` in the current directory. Files are named with the format:

```
01_VideoTitle_originalfilename.mp4
02_AnotherVideo_originalfilename.mp4
```

## Terminal Dashboard

While downloading, a live dashboard displays:

```
──────────────────────────────────────────────────────────────────────────
 📊 Progress: 5/20 done | 0 failed
──────────────────────────────────────────────────────────────────────────
  ⬇️  Slot 1 [6/20]  Video Title Here        ████████████░░░░░░░░ 60.5% 12.3MB/20.4MB
  ⬇️  Slot 2 [7/20]  Another Video           ████░░░░░░░░░░░░░░░░ 22.1% 4.5MB/20.1MB
  ⏳ Slot 3 [8/20]  Fetching Info            Fetching video info...
  💤 Slot 4         —                        Waiting...
──────────────────────────────────────────────────────────────────────────
```

## How It Works

1. Fetches the playlist metadata from Aparat's API
2. For each video, retrieves the direct download URL via the video API
3. Downloads videos concurrently using a configurable worker pool
4. Displays real-time progress with a terminal-based dashboard

## License

MIT
