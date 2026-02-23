const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PLAYLIST_API =
  "https://www.aparat.com/api/fa/v1/video/playlist/one/playlist_id/";
const VIDEO_API =
  "https://www.aparat.com/api/fa/v1/video/video/show/videohash/";
const DEFAULT_CONCURRENCY = 4;

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            isnext: true,
            jsontype: "simple",
          },
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            return fetch(res.headers.location).then(resolve).catch(reject);
          }
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
          res.on("error", reject);
        },
      )
      .on("error", reject);
  });
}

function downloadFile(url, dest, slotId) {
  return new Promise((resolve, reject) => {
    const doDownload = (downloadUrl) => {
      const client = downloadUrl.startsWith("https") ? https : http;
      const file = fs.createWriteStream(dest);

      const req = client.get(
        downloadUrl,
        {
          headers: { "User-Agent": "Mozilla/5.0" },
          agent: downloadUrl.startsWith("https") ? httpsAgent : httpAgent,
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            file.close();
            try {
              fs.unlinkSync(dest);
            } catch (_) {}
            return doDownload(res.headers.location);
          }

          const total = parseInt(res.headers["content-length"], 10) || 0;
          let downloaded = 0;

          res.on("data", (chunk) => {
            downloaded += chunk.length;
            if (total) {
              const pct = ((downloaded / total) * 100).toFixed(1);
              updateSlot(slotId, {
                pct,
                downloaded,
                total,
                status: "downloading",
              });
            }
          });

          res.pipe(file);

          file.on("finish", () => {
            file.close(() => resolve());
          });

          res.on("error", (err) => {
            file.close();
            try {
              fs.unlinkSync(dest);
            } catch (_) {}
            reject(err);
          });
        },
      );

      req.on("error", (err) => {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch (_) {}
        reject(err);
      });
    };

    doDownload(url);
  });
}

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const slots = new Map();
let totalVideos = 0;
let completedCount = 0;
let failedCount = 0;
let displayLines = 0;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function makeBar(pct) {
  const w = 20;
  const filled = Math.round((pct / 100) * w);
  return "█".repeat(filled) + "░".repeat(w - filled);
}

function truncate(str, max) {
  if (!str) return "—".padEnd(max);
  return str.length > max ? str.slice(0, max - 1) + "…" : str.padEnd(max);
}

function updateSlot(slotId, data) {
  const current = slots.get(slotId) || {};
  slots.set(slotId, { ...current, ...data });
  render();
}

function render() {
  if (displayLines > 0) {
    process.stdout.write(`\x1B[${displayLines}A\x1B[0J`);
  }

  const lines = [];
  lines.push(`\x1B[90m${"─".repeat(74)}\x1B[0m`);
  lines.push(
    ` 📊 Progress: ${completedCount}/${totalVideos} done | ${failedCount} failed`,
  );
  lines.push(`\x1B[90m${"─".repeat(74)}\x1B[0m`);

  for (const [slotId, info] of slots) {
    const tag = info.index != null ? `[${info.index + 1}/${totalVideos}]` : "";
    const name = truncate(info.title, 26);

    let line;
    switch (info.status) {
      case "fetching":
        line = `  ⏳ Slot ${slotId + 1} ${tag} ${name} Fetching video info...`;
        break;
      case "downloading": {
        const pct = parseFloat(info.pct) || 0;
        const bar = makeBar(pct);
        const size = info.total
          ? ` ${formatBytes(info.downloaded)}/${formatBytes(info.total)}`
          : "";
        line = `  ⬇️  Slot ${slotId + 1} ${tag} ${name} ${bar} ${pct.toFixed(1)}%${size}`;
        break;
      }
      case "done":
        line = `  ✅ Slot ${slotId + 1} ${tag} ${name} Complete`;
        break;
      case "error":
        line = `  ❌ Slot ${slotId + 1} ${tag} ${name} ${info.message || "Error"}`;
        break;
      case "skip":
        line = `  ⚠️  Slot ${slotId + 1} ${tag} ${name} Skipped (no download URL)`;
        break;
      case "idle":
        line = `  💤 Slot ${slotId + 1}  ${"—".padEnd(26)} Waiting...`;
        break;
      default:
        line = `  💤 Slot ${slotId + 1}`;
    }
    lines.push(line);
  }

  lines.push(`\x1B[90m${"─".repeat(74)}\x1B[0m`);

  process.stdout.write(lines.join("\n") + "\n");
  displayLines = lines.length;
}

async function processVideo(video, index, outputDir, slotId) {
  const uid = video.uid || video.videohash || video.id;
  const title = video.title || video.name || `video_${index + 1}`;

  updateSlot(slotId, { index, title, status: "fetching" });

  const videoRaw = await fetch(VIDEO_API + uid);
  const videoData = JSON.parse(videoRaw);
  const downloadUrl = videoData?.data?.file_link;

  if (!downloadUrl) {
    failedCount++;
    updateSlot(slotId, { index, title, status: "skip" });
    return;
  }

  const urlPath = new URL(downloadUrl).pathname;
  const urlFilename = path.basename(urlPath);
  const safeTitle = title.replace(/[^\w\u0600-\u06FF\s-]/g, "").trim();
  const filename = `${String(index + 1).padStart(2, "0")}_${safeTitle}_${urlFilename}`;
  const dest = path.join(outputDir, filename);

  updateSlot(slotId, {
    index,
    title,
    pct: "0",
    downloaded: 0,
    total: 0,
    status: "downloading",
  });

  await downloadFile(downloadUrl, dest, slotId);

  completedCount++;
  updateSlot(slotId, { index, title, status: "done" });
}

async function asyncPool(concurrency, tasks, outputDir) {
  let nextIndex = 0;

  async function runner(slotId) {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      const task = tasks[idx];

      try {
        await processVideo(task, idx, outputDir, slotId);
      } catch (err) {
        failedCount++;
        updateSlot(slotId, {
          index: idx,
          title: task.title || `video_${idx + 1}`,
          status: "error",
          message: err.message,
        });
      }
    }
    updateSlot(slotId, { status: "idle", title: "—" });
  }

  const runners = [];
  for (let i = 0; i < concurrency; i++) {
    updateSlot(i, { status: "idle" });
    runners.push(runner(i));
  }

  await Promise.all(runners);
}
async function main() {
  const playlistId = process.argv[2];
  const concurrency = parseInt(process.argv[3], 10) || DEFAULT_CONCURRENCY;

  if (!playlistId) {
    console.log("Usage: node aparat-downloader.js <playlist_id> [concurrency]");
    console.log(" concurrency: number of parallel downloads (default: 4)");
    process.exit(1);
  }

  const outputDir = path.join(".", `playlist_${playlistId}`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\n📋 Fetching playlist ${playlistId}...\n`);
  const playlistRaw = await fetch(PLAYLIST_API + playlistId);
  const playlistData = JSON.parse(playlistRaw);

  const videos = playlistData?.data?.video?.data;
  if (!videos || !Array.isArray(videos)) {
    console.log("Could not find video list in playlist response.");
    console.log(
      "Response keys:",
      JSON.stringify(Object.keys(playlistData?.data || playlistData), null, 2),
    );
    process.exit(1);
  }

  totalVideos = videos.length;
  console.log(
    `Found ${totalVideos} video(s) — ${concurrency} concurrent downloads\n`,
  );

  for (let i = 0; i < concurrency + 5; i++) console.log("");

  await asyncPool(concurrency, videos, outputDir);

  httpsAgent.destroy();
  httpAgent.destroy();

  console.log(
    `\n Done! ${completedCount} downloaded, ${failedCount} failed/skipped out of ${totalVideos}.`,
  );
  console.log(`Output: ${path.resolve(outputDir)}\n`);
}

main().catch((err) => {
  console.log("\nFatal error:", err);
  process.exit(1);
});
