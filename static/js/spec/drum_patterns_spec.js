import {TRACKS, PRESETS, STORAGE_KEY, emptyPattern, validatePattern, resizePattern, readSavedPatterns, stepDuration} from "st/drum_patterns"
import DrumAudio from "st/drum_audio"

describe("Drum patterns", () => {
  it("provides twelve independently editable, valid presets", () => {
    expect(PRESETS.length).toBe(12)
    for (const preset of PRESETS) {
      const pattern = validatePattern(preset.pattern)
      expect(Object.keys(pattern.tracks).length).toBe(TRACKS.length)
      pattern.tracks.kick[0] = !pattern.tracks.kick[0]
      expect(pattern.tracks.kick[0]).not.toBe(preset.pattern.tracks.kick[0])
    }
  })
  it("repeats a bar on extension and preserves the first bar on shortening", () => {
    const pattern = validatePattern(PRESETS[3].pattern)
    const extended = resizePattern(pattern, 2)
    expect(extended.tracks.kick).toEqual([...pattern.tracks.kick, ...pattern.tracks.kick])
    extended.tracks.kick[16] = false
    expect(resizePattern(extended, 1)).toEqual(pattern)
  })
  it("keeps the duration of each swing pair and whole bar constant", () => {
    for (const bpm of [30, 100, 240]) for (const swing of [0, 0.33, 0.5]) {
      expect(stepDuration(bpm, swing, 0) + stepDuration(bpm, swing, 1)).toBeCloseTo(30 / bpm, 8)
      expect(Array.from({length: 16}, (_, i) => stepDuration(bpm, swing, i)).reduce((a, b) => a + b)).toBeCloseTo(240 / bpm, 8)
    }
  })
  it("rejects corrupt or unsafe persisted values", () => {
    for (const patch of [{bpm: 0}, {bpm: Infinity}, {swing: -1}, {bars: 8}, {tracks: {}}]) {
      expect(() => validatePattern({...emptyPattern(), ...patch})).toThrow()
    }
    expect(() => readSavedPatterns({getItem: () => "{}"})).toThrow()
    expect(() => readSavedPatterns({getItem: () => "invalid json"})).toThrow()
  })
  it("round trips named patterns without sharing their step arrays", () => {
    const data = [{name: "My groove", pattern: resizePattern(PRESETS[0].pattern, 2)}]
    const storage = {getItem: key => key === STORAGE_KEY ? JSON.stringify(data) : null}
    expect(readSavedPatterns(storage)).toEqual(data)
    expect(readSavedPatterns({getItem: () => null})).toEqual([])
  })
})

describe("Drum audio lifecycle", () => {
  it("cancels a pending audio start when stopped before resume finishes", async () => {
    const audio = new DrumAudio(() => {})
    let resume
    audio.context = {resume: () => new Promise(resolve => { resume = resolve }), close: () => {}}
    const start = audio.start(() => emptyPattern(), () => ({}), 0.7)
    audio.stop()
    resume()
    expect(await start).toBe(false)
    expect(audio.timer).toBeUndefined()
    audio.dispose()
  })
})
