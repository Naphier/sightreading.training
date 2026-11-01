export const TRACKS = [
  ["kick", "Kick"], ["snare", "Snare"], ["closedHat", "Closed hi-hat"],
  ["openHat", "Open hi-hat"], ["clap", "Clap"], ["lowTom", "Low tom"],
  ["highTom", "High tom"], ["ride", "Ride"]
]
export const STORAGE_KEY = "drum-machine:patterns:v1"

export function emptyPattern(bars = 1) {
  return {bars, bpm: 100, swing: 0, tracks: Object.fromEntries(TRACKS.map(([id]) => [id, Array(bars * 16).fill(false)]))}
}

export function validatePattern(value) {
  if (!value || ![1, 2].includes(value.bars) || !Number.isFinite(value.bpm) || value.bpm < 30 || value.bpm > 240 ||
      !Number.isFinite(value.swing) || value.swing < 0 || value.swing > 0.5) throw new Error("Invalid drum pattern")
  const pattern = emptyPattern(value.bars)
  pattern.bpm = value.bpm
  pattern.swing = value.swing
  for (const [id] of TRACKS) {
    const steps = value.tracks?.[id]
    if (!Array.isArray(steps) || steps.length !== value.bars * 16 || steps.some(step => typeof step !== "boolean")) {
      throw new Error("Invalid drum steps")
    }
    pattern.tracks[id] = [...steps]
  }
  return pattern
}

export function resizePattern(pattern, bars) {
  const next = {...pattern, bars, tracks: {}}
  for (const [id] of TRACKS) {
    next.tracks[id] = Array.from({length: bars * 16}, (_, i) => pattern.tracks[id][i % pattern.tracks[id].length])
  }
  return next
}

// Swing delays the offbeat eighth (&), keeping sixteenths evenly spaced
// within each eighth. Each quarter note retains its original duration.
export function stepDuration(bpm, swing, step) {
  return 60 / bpm / 4 * (step % 4 < 2 ? 1 + swing : 1 - swing)
}

function preset(name, bpm, hits, swing = 0) {
  const pattern = emptyPattern()
  pattern.bpm = bpm
  pattern.swing = swing
  for (const [id, steps] of Object.entries(hits)) for (const step of steps) pattern.tracks[id][step] = true
  return {name, pattern}
}
const eighths = [0, 2, 4, 6, 8, 10, 12, 14]
export const PRESETS = [
  preset("Straight rock", 100, {kick: [0, 8], snare: [4, 12], closedHat: eighths}),
  preset("Four on the floor", 120, {kick: [0, 4, 8, 12], snare: [4, 12], openHat: [2, 6, 10, 14]}),
  preset("Blues shuffle", 90, {kick: [0, 8], snare: [4, 12], ride: eighths}, 0.33),
  preset("Funk pocket", 105, {kick: [0, 3, 6, 10], snare: [4, 12, 15], closedHat: eighths, openHat: [14]}),
  preset("Hip-hop", 85, {kick: [0, 7, 10], snare: [4, 12], closedHat: eighths}, 0.15),
  preset("Disco", 118, {kick: [0, 4, 8, 12], clap: [4, 12], closedHat: [0, 4, 8, 12], openHat: [2, 6, 10, 14]}),
  preset("Synthwave", 100, {kick: [0, 6, 8], snare: [4, 12], clap: [4, 12], closedHat: eighths}),
  preset("Reggae", 78, {kick: [8], snare: [8], closedHat: [2, 6, 10, 14]}),
  preset("Bossa nova", 130, {kick: [0, 6, 8, 14], snare: [0, 6, 12], closedHat: eighths}),
  preset("Half-time", 140, {kick: [0, 6, 14], snare: [8], closedHat: eighths}),
  preset("Drum and bass", 170, {kick: [0, 10], snare: [4, 12], closedHat: eighths, openHat: [7, 15]}),
  preset("Tom fill", 110, {kick: [0, 8], snare: [4, 6], highTom: [8, 9, 10, 11], lowTom: [12, 13, 14, 15]})
]

export function readSavedPatterns(storage) {
  const data = JSON.parse(storage.getItem(STORAGE_KEY) || "[]")
  if (!Array.isArray(data) || data.length > 100) throw new Error("Invalid saved patterns")
  return data.map(item => {
    if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 60) throw new Error("Invalid pattern name")
    return {name: item.name, pattern: validatePattern(item.pattern)}
  })
}
