import { execFile } from 'node:child_process';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

function exec(bin, args, timeout = 90000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 24 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      if (error && error.code === 'ENOENT') {
        const missing = new Error(
          `Video analysis engine unavailable: ${bin} is not installed on this server.`,
        );
        missing.code = 'BINARY_MISSING';
        return reject(missing);
      }
      if (error && error.killed) {
        return reject(new Error('Media analysis timed out while reading this file.'));
      }
      resolve({ stdout: stdout || '', stderr: stderr || '', failed: Boolean(error) });
    });
  });
}

export const mediaToolsAvailable = async () => {
  try {
    await exec(FFPROBE, ['-version'], 8000);
    return true;
  } catch {
    return false;
  }
};

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export async function probe(file) {
  const { stdout } = await exec(FFPROBE, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    file,
  ]);
  let json;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new Error('This file could not be read as a video. Try MP4, MOV or WebM.');
  }
  const streams = json.streams || [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  if (!video) throw new Error('No video track found in this file.');

  const [num_, den] = String(video.avg_frame_rate || video.r_frame_rate || '0/1').split('/').map(Number);
  const fps = den ? num_ / den : 0;
  const format = json.format || {};
  const duration = num(format.duration, num(video.duration, 0));

  return {
    duration,
    width: num(video.width),
    height: num(video.height),
    fps: Number.isFinite(fps) ? Math.round(fps * 100) / 100 : 0,
    videoCodec: video.codec_name || 'unknown',
    bitrateKbps: Math.round(num(format.bit_rate) / 1000),
    sizeBytes: num(format.size),
    hasAudio: Boolean(audio),
    audioCodec: audio ? audio.codec_name || 'unknown' : null,
    sampleRate: audio ? num(audio.sample_rate) : 0,
    channels: audio ? num(audio.channels) : 0,
    audioBitrateKbps: audio ? Math.round(num(audio.bit_rate) / 1000) : 0,
    container: format.format_name || '',
  };
}

function parseVolumes(stderr) {
  const mean = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
  const max = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/);
  return {
    meanVolume: mean ? num(mean[1], -99) : null,
    maxVolume: max ? num(max[1], -99) : null,
  };
}

export async function audioStats(file, hasAudio) {
  if (!hasAudio) {
    return { meanVolume: null, maxVolume: null, silenceRatio: null, silenceSeconds: 0, first3MeanVolume: null };
  }
  const common = ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-f', 'null', '-'];
  const [overall, silence, first] = await Promise.all([
    exec(FFMPEG, [...common.slice(0, 4), '-af', 'volumedetect', ...common.slice(4)]),
    exec(FFMPEG, [...common.slice(0, 4), '-af', 'silencedetect=noise=-35dB:d=0.35', ...common.slice(4)]),
    exec(FFMPEG, ['-hide_banner', '-nostats', '-t', '3', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']),
  ]);

  const volumes = parseVolumes(overall.stderr);
  const firstVolumes = parseVolumes(first.stderr);
  let silenceSeconds = 0;
  for (const match of silence.stderr.matchAll(/silence_duration:\s*([\d.]+)/g)) {
    silenceSeconds += num(match[1]);
  }
  const probeInfo = await probe(file).catch(() => null);
  const duration = probeInfo ? probeInfo.duration : 0;
  return {
    meanVolume: volumes.meanVolume,
    maxVolume: volumes.maxVolume,
    first3MeanVolume: firstVolumes.meanVolume,
    silenceSeconds: Math.round(silenceSeconds * 10) / 10,
    silenceRatio: duration > 0 ? Math.min(1, silenceSeconds / duration) : null,
  };
}

export async function sceneStats(file, maxSeconds = 240) {
  const [scenes, freezes] = await Promise.all([
    exec(FFMPEG, [
      '-hide_banner', '-nostats', '-t', String(maxSeconds), '-i', file, '-an',
      '-vf', "select='gt(scene,0.28)',showinfo", '-f', 'null', '-',
    ]),
    exec(FFMPEG, [
      '-hide_banner', '-nostats', '-t', String(maxSeconds), '-i', file, '-an',
      '-vf', 'freezedetect=n=-60dB:d=1.2', '-f', 'null', '-',
    ]),
  ]);

  const cutTimes = [...scenes.stderr.matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => num(m[1]));
  const freezeCount = [...freezes.stderr.matchAll(/freeze_start/g)].length;
  return {
    cutTimes,
    cuts: cutTimes.length,
    first3Cuts: cutTimes.filter((t) => t <= 3).length,
    freezeCount,
    scannedSeconds: Math.min(maxSeconds, cutTimes.length ? Math.max(...cutTimes) : maxSeconds),
  };
}

export async function frameStats(file, at = 1) {
  const { stderr } = await exec(FFMPEG, [
    '-hide_banner', '-nostats', '-ss', String(Math.max(0, at)), '-i', file,
    '-frames:v', '1', '-vf', 'signalstats,metadata=print', '-f', 'null', '-',
  ]);
  const pick = (key) => {
    const m = stderr.match(new RegExp(`lavfi\\.signalstats\\.${key}=([\\d.]+)`));
    return m ? num(m[1]) : null;
  };
  return {
    luma: pick('YAVG'),
    saturation: pick('SATAVG'),
    motion: pick('YDIF'),
    hue: pick('HUEMED'),
  };
}

export async function makeThumbnail(file, outPath, at = 1) {
  await exec(FFMPEG, [
    '-hide_banner', '-nostats', '-y', '-ss', String(Math.max(0, at)), '-i', file,
    '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', outPath,
  ], 45000);
  return outPath;
}

export async function makeClip(file, outPath, start, duration) {
  await exec(FFMPEG, [
    '-hide_banner', '-nostats', '-y', '-ss', String(Math.max(0, start)), '-t', String(duration),
    '-i', file, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac',
    '-movflags', '+faststart', outPath,
  ], 90000);
  return outPath;
}
