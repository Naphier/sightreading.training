import {TRACKS, PRESETS, STORAGE_KEY, emptyPattern, validatePattern, resizePattern, readSavedPatterns, stepDuration} from "st/drum_patterns"
import DrumAudio from "st/drum_audio"
import DrumMachinePage from "st/components/pages/drum_machine_page"

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
  it("delays offbeat eighths while keeping quarter notes and whole bars constant", () => {
    for (const bpm of [30, 100, 240]) for (const swing of [0, 0.33, 0.5]) {
      const durations = Array.from({length: 4}, (_, i) => stepDuration(bpm, swing, i))
      expect(durations[0] + durations[1]).toBeCloseTo(30 / bpm * (1 + swing), 8)
      expect(durations.reduce((a, b) => a + b)).toBeCloseTo(60 / bpm, 8)
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
  it("schedules the blues shuffle ride with alternating long and short eighths", async () => {
    jasmine.clock().install()
    spyOn(window, "requestAnimationFrame").and.returnValue(1)
    spyOn(window, "cancelAnimationFrame")
    const audio = new DrumAudio(() => {})
    audio.context = {
      currentTime: 0, sampleRate: 1, resume: async () => {},
      createGain: () => ({gain: {}, connect() {}, disconnect() {}}),
      createBuffer: () => ({getChannelData: () => new Float32Array(1)})
    }
    spyOn(audio, "hit")
    try {
      const pattern = PRESETS.find(p => p.name === "Blues shuffle").pattern
      await audio.start(() => pattern, () => ({}), 0.7)
      for (let tick = 0; tick < 120; tick++) {
        audio.context.currentTime += 0.025
        jasmine.clock().tick(25)
      }
      const hits = audio.hit.calls.allArgs().filter(([id]) => id === "ride").map(([, time]) => time)
      expect(hits.length).toBeGreaterThanOrEqual(9)
      for (let i = 0; i < 9; i++) {
        expect(hits[i]).toBeCloseTo(0.04 + i * 30 / pattern.bpm + (i % 2) * 30 / pattern.bpm * pattern.swing, 8)
      }
    } finally {
      audio.stop()
      jasmine.clock().uninstall()
    }
  })
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

describe("Drum tempo editing", () => {
  let page
  beforeEach(() => {
    page = new DrumMachinePage({})
    // Exercise the component's state transitions without mounting an audio page.
    page.setState = update => Object.assign(page.state, typeof update === "function" ? update(page.state) : update)
  })
  it("allows clearing and typing a replacement tempo while playback retains a valid BPM", () => {
    for (const value of ["", "1", "12"]) {
      page.changeTempo(value)
      expect(page.state.tempoInput).toBe(value)
      expect(page.state.pattern.bpm).toBe(100)
    }
    page.changeTempo("125")
    expect(page.state.pattern.bpm).toBe(125)
    page.commitTempo()
    expect(page.state.tempoInput).toBe("125")
  })
  it("clamps out-of-range entries on commit and restores empty entries", () => {
    for (const [input, expected] of [["999", 240], ["2", 30], ["", 30]]) {
      page.changeTempo(input)
      page.commitTempo()
      expect(page.state.pattern.bpm).toBe(expected)
      expect(page.state.tempoInput).toBe(String(expected))
    }
  })
  it("updates the tempo field when loading another pattern", () => {
    page.changeTempo("")
    page.changePattern(validatePattern(PRESETS[1].pattern))
    expect(page.state.tempoInput).toBe(String(PRESETS[1].pattern.bpm))
  })
})
