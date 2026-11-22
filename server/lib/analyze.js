import { clamp, round } from './util.js';
import { platformById } from './plans.js';

export const SCORE_DISCLAIMER =
  'Scores are AI estimates derived from measurable media signals and the details you provide. They are not a guarantee of virality, reach or platform performance.';

const band = (score) => {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Solid base';
  if (score >= 40) return 'Needs work';
  return 'Critical';
};

const finding = (area, severity, title, detail, fix) => ({ area, severity, title, detail, fix });

/**
 * Turn measurable media signals into a transparent, heuristic content analysis.
 * Every deduction below is tied to a real measurement (ffprobe/ffmpeg) or an
 * explicitly declared input from the creator.
 */
export function buildAnalysis({ probe, audio, scenes, frames, context = {}, platformId }) {
  const platform = platformById(platformId);
  const duration = round(probe.duration, 1);
  const shortSide = Math.min(probe.width || 0, probe.height || 0);
  const longSide = Math.max(probe.width || 0, probe.height || 0);
  const vertical = (probe.height || 0) >= (probe.width || 0);
  const aspect = probe.width && probe.height ? round(probe.width / probe.height, 3) : 0;
  const cutsPerMinute = duration > 0 ? round((scenes.cuts / duration) * 60, 1) : 0;
  const [minCuts, maxCuts] = platform.benchmarkCutsPerMinute;
  const findings = [];

  /* ------------------------------- HOOK ------------------------------- */
  let hook = 52;
  if (scenes.first3Cuts >= 1 && scenes.first3Cuts <= 4) hook += 16;
  else if (scenes.first3Cuts >= 5) hook += 7;
  else {
    hook -= 14;
    findings.push(
      finding(
        'hook',
        'critical',
        'Your first 3 seconds have no visual change',
        `We detected 0 cuts or scene changes in the opening 3 seconds. Short-form feeds decide whether to keep watching almost immediately, so a static opener gives the algorithm no signal that anything is happening.`,
        'Open on your strongest frame, result or reaction. Add one cut, zoom or on-screen text beat before 1.5s, then a second before 3s.',
      ),
    );
  }
  if (audio.first3MeanVolume !== null && audio.meanVolume !== null) {
    const lift = round(audio.first3MeanVolume - audio.meanVolume, 1);
    if (lift >= 1.5) hook += 9;
    else if (lift <= -2) {
      hook -= 8;
      findings.push(
        finding(
          'hook',
          'warning',
          'Your opening is quieter than the rest of the video',
          `The first 3 seconds average ${audio.first3MeanVolume} dB versus ${audio.meanVolume} dB for the full video (${lift} dB). Quiet openings feel low-energy in a loud feed.`,
          'Raise the opening voice/music level by 2–3 dB so the first sentence lands at full energy, then keep levels consistent.',
        ),
      );
    }
  }
  if (frames.motion !== null) {
    if (frames.motion > 8) hook += 8;
    else if (frames.motion < 3) hook -= 6;
  }
  if (vertical && duration <= 90) hook += 6;
  if (!probe.hasAudio) hook -= 10;

  /* ------------------------------ EDITING ----------------------------- */
  let editing = 50;
  if (cutsPerMinute >= minCuts && cutsPerMinute <= maxCuts) editing += 22;
  else if (cutsPerMinute > 0 && cutsPerMinute < minCuts / 2) {
    editing -= 16;
    findings.push(
      finding(
        'editing',
        'warning',
        'Pacing is much slower than your platform benchmark',
        `We counted ${scenes.cuts} cuts in ${duration}s (${cutsPerMinute}/min). ${platform.name} short-form typically runs ${minCuts}–${maxCuts} cuts per minute.`,
        'Cut dead air: remove setup sentences, add a B-roll or zoom every 2–4 seconds, and trim the first 0.5s of every clip.',
      ),
    );
  } else if (cutsPerMinute > maxCuts * 1.6) {
    editing -= 10;
    findings.push(
      finding(
        'editing',
        'warning',
        'Cutting faster than the content can be read',
        `${cutsPerMinute} cuts per minute is above the ${maxCuts}/min upper benchmark for ${platform.name}. Viewers lose the subject and on-screen text becomes unreadable.`,
        'Hold each shot for at least 1.5–2 seconds and keep text on screen for a minimum of 1.2 seconds.',
      ),
    );
  } else if (cutsPerMinute === 0 && duration > 10) {
    editing -= 12;
  }
  if (scenes.freezeCount === 0) editing += 10;
  else {
    editing -= Math.min(14, scenes.freezeCount * 6);
    findings.push(
      finding(
        'editing',
        'warning',
        'Frozen frames detected',
        `${scenes.freezeCount} freeze event${scenes.freezeCount === 1 ? '' : 's'} longer than 1.2s were detected. Freezes read as a buffering error and kill retention.`,
        'Re-export with matching frame rates and trim any held frames that last more than one second.',
      ),
    );
  }
  if (shortSide >= 1080) editing += 8;
  else if (shortSide >= 720) editing += 3;
  else {
    editing -= 10;
    findings.push(
      finding(
        'quality',
        'warning',
        'Resolution is below platform recommendation',
        `Your file is ${probe.width}×${probe.height}. ${platform.name} recommends at least 1080×1920 vertical for short-form uploads.`,
        'Record or export at 1080×1920 (9:16) and keep the bitrate above 8 Mbps for crisp text overlays.',
      ),
    );
  }
  if (probe.fps >= 30) editing += 5;
  else if (probe.fps >= 24) editing += 1;
  else if (probe.fps > 0) editing -= 8;

  /* ------------------------------- AUDIO ------------------------------ */
  let audioScore;
  if (!probe.hasAudio) {
    audioScore = 18;
    findings.push(
      finding(
        'audio',
        'critical',
        'This video has no audio track',
        'No audio stream was found in the file. Silent uploads lose music, voiceover and the audio cues that drive watch time on every major platform.',
        'Add a voiceover or trending sound track and re-export with AAC audio at 128 kbps or higher.',
      ),
    );
  } else {
    audioScore = 48;
    const mean = audio.meanVolume;
    if (mean !== null) {
      if (mean >= -22 && mean <= -12) audioScore += 22;
      else if (mean > -28) audioScore += 10;
      else if (mean > -32) audioScore -= 4;
      else {
        audioScore -= 16;
        findings.push(
          finding(
            'audio',
            'critical',
            'Audio is far too quiet',
            `Average loudness is ${mean} dB. Most social platforms normalise around -14 LUFS; anything below -30 dB gets buried in the feed.`,
            'Normalise the mix to roughly -14 LUFS, then verify the peak stays under -1 dB.',
          ),
        );
      }
      if (mean > -8) {
        audioScore -= 10;
        findings.push(
          finding(
            'audio',
            'warning',
            'Audio is close to clipping',
            `Average loudness of ${mean} dB leaves almost no headroom. Distortion makes viewers scroll.`,
            'Pull the master fader down 2–3 dB and use a limiter at -1 dB.',
          ),
        );
      }
    }
    if (audio.maxVolume !== null) {
      if (audio.maxVolume > -0.3) {
        audioScore -= 12;
        findings.push(
          finding(
            'audio',
            'warning',
            'Peaks are clipping',
            `Peak level measured ${audio.maxVolume} dB, which is at the digital ceiling.`,
            'Lower the master by 1–2 dB and re-check the peak meter before exporting.',
          ),
        );
      } else if (audio.maxVolume <= -1) audioScore += 5;
    }
    if (audio.silenceRatio !== null) {
      if (audio.silenceRatio <= 0.1) audioScore += 12;
      else if (audio.silenceRatio <= 0.2) audioScore += 6;
      else if (audio.silenceRatio >= 0.35) {
        audioScore -= 12;
        findings.push(
          finding(
            'audio',
            'warning',
            'Long stretches of silence',
            `${round(audio.silenceRatio * 100, 1)}% of the runtime (${audio.silenceSeconds}s) is silence. Dead air is the fastest way to lose a viewer.`,
            'Trim pauses to under 0.4s, or fill them with music, whooshes or a B-roll cut.',
          ),
        );
      }
    }
    if (probe.sampleRate >= 44100) audioScore += 6;
    else if (probe.sampleRate > 0 && probe.sampleRate < 32000) audioScore -= 8;
    if (probe.channels >= 2) audioScore += 2;
  }

  /* ------------------------------ QUALITY ----------------------------- */
  let quality = 50;
  if (shortSide >= 1080) quality += 18;
  else if (shortSide >= 720) quality += 8;
  else if (shortSide < 540) quality -= 18;
  else quality -= 8;

  const pixels = (probe.width || 1) * (probe.height || 1);
  const bitsPerPixel = pixels > 0 ? (probe.bitrateKbps * 1000) / pixels : 0;
  if (bitsPerPixel >= 0.1) quality += 10;
  else if (bitsPerPixel < 0.04) {
    quality -= 10;
    findings.push(
      finding(
        'quality',
        'warning',
        'Bitrate is low for this resolution',
        `The file averages ${probe.bitrateKbps} kbps at ${probe.width}×${probe.height}. Compression artifacts show up on gradients, skin tones and text.`,
        'Export at 8–12 Mbps for 1080p vertical, or use a higher quality preset in your editor.',
      ),
    );
  }
  if (frames.luma !== null) {
    if (frames.luma >= 60 && frames.luma <= 190) quality += 8;
    else if (frames.luma < 35) {
      quality -= 12;
      findings.push(
        finding(
          'quality',
          'warning',
          'Opening frame is underexposed',
          `Average luma of the sampled frame is ${round(frames.luma, 1)}/255. Dark openers look muddy on phone screens in daylight.`,
          'Lift exposure and shadows by 10–15%, or open on a brighter frame from later in the clip.',
        ),
      );
    } else if (frames.luma > 230) quality -= 8;
  }
  if (frames.saturation !== null && frames.saturation > 20 && frames.saturation < 130) quality += 6;
  if (frames.motion !== null && frames.motion > 4) quality += 6;

  /* ------------------------------- LENGTH ----------------------------- */
  const [idealMin, idealMax] = platform.idealLength;
  let lengthScore = 55;
  if (duration >= idealMin && duration <= idealMax) lengthScore += 30;
  else if (duration < idealMin) {
    lengthScore -= duration < idealMin * 0.5 ? 18 : 6;
    findings.push(
      finding(
        'length',
        'warning',
        'Shorter than the sweet spot for this platform',
        `Your video is ${duration}s. ${platform.name} performs best between ${idealMin}–${idealMax}s for the format you selected.`,
        `Extend to at least ${idealMin}s with one extra payoff beat, or re-cut it as a teaser.`,
      ),
    );
  } else if (duration > idealMax) {
    lengthScore -= duration > idealMax * 2 ? 20 : 8;
    findings.push(
      finding(
        'length',
        'warning',
        'Longer than the sweet spot for this platform',
        `Your video is ${duration}s versus the ${idealMin}–${idealMax}s window for ${platform.name}.`,
        'Cut the weakest 20% of the runtime or split the idea into two videos.',
      ),
    );
  }

  /* ------------------------------- PACING ----------------------------- */
  let pacing = 50;
  if (cutsPerMinute >= minCuts && cutsPerMinute <= maxCuts) pacing += 20;
  else if (cutsPerMinute < minCuts) pacing -= 8;
  else pacing -= 4;
  if (scenes.freezeCount > 0) pacing -= Math.min(18, scenes.freezeCount * 8);
  if (audio.silenceRatio !== null && audio.silenceRatio > 0.3) pacing -= 12;
  if (frames.motion !== null && frames.motion > 10) pacing += 8;

  /* ------------------------------ CAPTIONS ---------------------------- */
  const captionsDeclared = context.hasCaptions || 'unknown';
  let captions = 50;
  let captionNote = 'Caption state was not declared, so this is scored neutrally.';
  if (captionsDeclared === 'yes') {
    captions = 82;
    captionNote = 'You reported burned-in or platform captions on this video.';
  } else if (captionsDeclared === 'auto') {
    captions = 62;
    captionNote = 'Auto-generated captions only — expect transcription errors on names and hooks.';
    findings.push(
      finding(
        'captions',
        'warning',
        'Only auto-generated captions',
        'Auto captions frequently mis-hear hooks, product names and numbers, which weakens the first three seconds.',
        'Proofread the auto captions and burn in a styled caption for the first sentence.',
      ),
    );
  } else if (captionsDeclared === 'no') {
    captions = 34;
    captionNote = 'You reported no captions on this video.';
    findings.push(
      finding(
        'captions',
        'critical',
        'No captions on a feed that is mostly watched on mute',
        'Most short-form viewing starts muted. Without on-screen text, the hook cannot land.',
        'Add word-by-word captions with high contrast, keep them inside the safe area, and highlight the key word in your accent colour.',
      ),
    );
  }
  if (context.subtitleCoverage) {
    const coverage = clamp(Number(context.subtitleCoverage), 0, 100);
    captions = Math.round(captions * 0.6 + coverage * 0.4);
    captionNote = `Subtitle file covers ${round(coverage, 1)}% of the runtime.`;
  }

  /* ---------------------------- STORYTELLING -------------------------- */
  let storytelling = 50;
  const structure = context.structure || '';
  if (structure === 'hook-problem-payoff') storytelling += 20;
  else if (structure === 'listicle') storytelling += 12;
  else if (structure === 'tutorial') storytelling += 10;
  else if (structure === 'talking-head') storytelling += 2;
  if (context.hasCta === 'yes') storytelling += 10;
  else if (context.hasCta === 'no') {
    storytelling -= 8;
    findings.push(
      finding(
        'storytelling',
        'warning',
        'No clear call to action',
        'The video ends without telling the viewer what to do next, so saves, follows and shares are left to chance.',
        'End with one specific action: "Save this for your next shoot" or "Follow for part 2".',
      ),
    );
  }
  storytelling += (pacing - 50) * 0.2 + (hook - 50) * 0.15;

  /* ----------------------------- ENGAGEMENT --------------------------- */
  let engagement =
    hook * 0.4 + pacing * 0.2 + audioScore * 0.15 + lengthScore * 0.15 + captions * 0.1;
  if (context.hasCta === 'yes') engagement += 4;

  /* ------------------------------ RETENTION --------------------------- */
  let retention =
    hook * 0.35 + pacing * 0.25 + lengthScore * 0.2 + quality * 0.1 + captions * 0.1;
  const reportedRetention = Number(context.retentionPct);
  if (Number.isFinite(reportedRetention) && reportedRetention > 0) {
    const mapped = clamp((reportedRetention / 60) * 100, 0, 100);
    retention = retention * 0.6 + mapped * 0.4;
    if (reportedRetention < 35) {
      findings.push(
        finding(
          'retention',
          'critical',
          `Reported retention is ${reportedRetention}%`,
          'Viewers are leaving before the midpoint. The drop almost always happens in the first 3 seconds or at the first slow beat.',
          'Shorten the setup to one sentence, move the payoff earlier, and re-check retention after 48 hours.',
        ),
      );
    }
  }

  /* ----------------------------- ORIGINALITY -------------------------- */
  const originalityDeclared = context.originality || 'unknown';
  const originality = originalityDeclared === 'original' ? 80 : originalityDeclared === 'remix' ? 66 : originalityDeclared === 'repost' ? 34 : 60;
  if (originalityDeclared === 'repost') {
    findings.push(
      finding(
        'originality',
        'critical',
        'Reposted content is suppressed by every major algorithm',
        'You flagged this as a repost. Platforms deprioritise unedited reposts and may reduce reach for the whole account.',
        'Re-shoot the idea in your own voice, or add original commentary, reaction and editing to make it transformative.',
      ),
    );
  }

  const scores = {
    hook: clamp(Math.round(hook), 5, 97),
    editing: clamp(Math.round(editing), 5, 97),
    audio: clamp(Math.round(audioScore), 5, 97),
    quality: clamp(Math.round(quality), 5, 97),
    length: clamp(Math.round(lengthScore), 5, 97),
    pacing: clamp(Math.round(pacing), 5, 97),
    captions: clamp(Math.round(captions), 5, 97),
    storytelling: clamp(Math.round(storytelling), 5, 97),
    engagement: clamp(Math.round(engagement), 5, 97),
    retention: clamp(Math.round(retention), 5, 97),
    originality: clamp(Math.round(originality), 5, 97),
  };

  const overall = Math.round(
    scores.hook * 0.24 +
      scores.editing * 0.16 +
      scores.audio * 0.16 +
      scores.quality * 0.1 +
      scores.pacing * 0.1 +
      scores.engagement * 0.1 +
      scores.retention * 0.08 +
      scores.captions * 0.03 +
      scores.length * 0.03,
  );
  scores.overall = clamp(overall, 5, 97);

  if (scores.hook >= 75 && scores.audio >= 70 && scores.editing >= 70) {
    findings.push(
      finding(
        'hook',
        'good',
        'Strong technical foundation',
        `Hook ${scores.hook}, audio ${scores.audio} and editing ${scores.editing} are all in a healthy range. The remaining upside is in packaging: title, caption and thumbnail.`,
        'Keep this production standard and A/B test two different opening frames on your next upload.',
      ),
    );
  }
  if (scores.retention >= 70) {
    findings.push(
      finding(
        'retention',
        'good',
        'Pacing supports retention',
        `With ${scenes.cuts} cuts across ${duration}s and ${scenes.freezeCount} freezes, the edit keeps visual momentum.`,
        'Keep the cut density and test a 3-second-longer ending to see whether completion rate holds.',
      ),
    );
  }

  const severityRank = { critical: 0, warning: 1, good: 2 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const metrics = {
    duration,
    width: probe.width,
    height: probe.height,
    aspect,
    orientation: vertical ? 'vertical' : 'landscape',
    fps: probe.fps,
    bitrateKbps: probe.bitrateKbps,
    videoCodec: probe.videoCodec,
    hasAudio: probe.hasAudio,
    audioCodec: probe.audioCodec,
    sampleRate: probe.sampleRate,
    channels: probe.channels,
    meanVolume: audio.meanVolume,
    maxVolume: audio.maxVolume,
    silenceRatio: audio.silenceRatio === null ? null : round(audio.silenceRatio, 3),
    silenceSeconds: audio.silenceSeconds,
    cuts: scenes.cuts,
    cutsPerMinute,
    first3Cuts: scenes.first3Cuts,
    freezeCount: scenes.freezeCount,
    luma: frames.luma === null ? null : round(frames.luma, 1),
    saturation: frames.saturation === null ? null : round(frames.saturation, 1),
    motion: frames.motion === null ? null : round(frames.motion, 1),
    benchmarkCutsPerMinute: [minCuts, maxCuts],
    idealLength: [idealMin, idealMax],
    captionNote,
    declared: {
      hasCaptions: captionsDeclared,
      structure: context.structure || null,
      hasCta: context.hasCta || null,
      originality: originalityDeclared,
      retentionPct: Number.isFinite(reportedRetention) ? reportedRetention : null,
    },
  };

  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const verdict = band(scores.overall);
  const summary =
    `${verdict} — overall ${scores.overall}/100 for ${platform.name}. ` +
    `${critical} critical issue${critical === 1 ? '' : 's'} and ${warnings} warning${warnings === 1 ? '' : 's'} detected. ` +
    (critical
      ? `Fix this first: ${findings.find((f) => f.severity === 'critical').title.toLowerCase()}.`
      : `Biggest remaining lever: ${
          Object.entries(scores)
            .filter(([k]) => k !== 'overall')
            .sort((a, b) => a[1] - b[1])[0][0]
        }.`) +
    ' These scores are an AI estimate built from measured signals, not a guarantee of going viral.';

  return { scores, metrics, findings, summary, verdict, disclaimer: SCORE_DISCLAIMER };
}
