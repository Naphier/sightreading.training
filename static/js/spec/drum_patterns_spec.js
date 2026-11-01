import {TRACKS, PRESETS, STORAGE_KEY, emptyPattern, validatePattern, resizePattern, readSavedPatterns, stepDuration, TIME_SIGNATURES, changeTimeSignature, stepMarker} from "st/drum_patterns"
import DrumAudio from "st/drum_audio"
import DrumMachinePage from "st/components/pages/drum_machine_page"

describe("Drum patterns", () => {
  it("provides eighteen independently editable, valid presets", () => {
    expect(PRESETS.length).toBe(18)
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
    for (const patch of [{bpm: 0}, {bpm: Infinity}, {swing: -1}, {bars: 8}, {tracks: {}}, {timeSignature: "7/8"}, {timeSignature: ["4/4"]}, {timeSignature: "3/4"}]) {
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
    page.setState = (update, callback) => {
      Object.assign(page.state, typeof update === "function" ? update(page.state) : update)
      if (callback) callback()
    }
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
  it("restarts playback at the beginning when changing time signature", () => {
    page.state.playing = true
    page.state.currentStep = 15
    spyOn(page.audio, "stop")
    spyOn(page, "togglePlayback")
    page.changePattern(changeTimeSignature(page.state.pattern, "3/4"))
    expect(page.audio.stop).toHaveBeenCalled()
    expect(page.state.currentStep).toBe(-1)
    expect(page.state.pattern.timeSignature).toBe("3/4")
    expect(page.togglePlayback).toHaveBeenCalled()
  })
  it("updates the tempo field when loading another pattern", () => {
    page.changeTempo("")
    page.changePattern(validatePattern(PRESETS[1].pattern))
    expect(page.state.tempoInput).toBe(String(PRESETS[1].pattern.bpm))
  })
})


describe("Drum time signatures", () => {
  it("builds and round trips one- and two-bar patterns in every meter", () => {
    for (const [signature, meter] of Object.entries(TIME_SIGNATURES)) for (const bars of [1, 2]) {
      const pattern = emptyPattern(bars, signature)
      pattern.tracks.kick[pattern.tracks.kick.length - 1] = true
      expect(pattern.tracks.kick.length).toBe(meter.steps * bars)
      expect(validatePattern(pattern)).toEqual(pattern)
      const saved = [{name: signature, pattern}]
      expect(readSavedPatterns({getItem: () => JSON.stringify(saved)})).toEqual(saved)
    }
  })
  it("loads legacy saved patterns as 4/4 without changing their hits", () => {
    const legacy = validatePattern(PRESETS[0].pattern)
    delete legacy.timeSignature
    const [saved] = readSavedPatterns({getItem: () => JSON.stringify([{name: "Old beat", pattern: legacy}])})
    expect(saved.pattern.timeSignature).toBe("4/4")
    expect(saved.pattern.tracks).toEqual(legacy.tracks)
  })
  it("changes meters per bar without shifting the second bar's hits", () => {
    const pattern = emptyPattern(2)
    pattern.tracks.kick[0] = true
    pattern.tracks.kick[16] = true
    pattern.tracks.snare[15] = true
    pattern.tracks.snare[31] = true
    const longer = changeTimeSignature(pattern, "5/4")
    expect(longer.tracks.kick[20]).toBeTrue()
    expect(longer.tracks.snare[35]).toBeTrue()
    expect(longer.tracks.snare.slice(16, 20)).toEqual([false, false, false, false])
    const shorter = changeTimeSignature(longer, "3/4")
    expect(shorter.tracks.kick[12]).toBeTrue()
    expect(shorter.tracks.snare.every(hit => !hit)).toBeTrue()
    expect(pattern.tracks.snare[15]).toBeTrue()
  })
  it("repeats and shortens bars correctly in every meter", () => {
    for (const signature of Object.keys(TIME_SIGNATURES)) {
      const pattern = emptyPattern(1, signature)
      pattern.tracks.kick[0] = true
      const extended = resizePattern(pattern, 2)
      expect(extended.tracks.kick).toEqual([...pattern.tracks.kick, ...pattern.tracks.kick])
      expect(resizePattern(extended, 1)).toEqual(pattern)
    }
  })
  it("keeps bar timing constant with swing and uses two dotted quarters for 6/8", () => {
    for (const [signature, meter] of Object.entries(TIME_SIGNATURES)) {
      for (const bpm of [30, 100, 240]) for (const swing of [0, 0.33, 0.5]) {
        const durations = Array.from({length: meter.steps}, (_, i) => stepDuration(bpm, swing, i, signature))
        expect(durations.reduce((a, b) => a + b)).toBeCloseTo(meter.steps / meter.beatSteps * 60 / bpm, 8)
        if (signature === "6/8") expect(new Set(durations).size).toBe(1)
      }
    }
  })
  it("labels bar boundaries and compound beat groups", () => {
    expect(stepMarker(emptyPattern(2, "3/4"), 12)).toEqual({label: "2.1", size: "quarter"})
    expect(stepMarker(emptyPattern(1, "5/4"), 16)).toEqual({label: "1.5", size: "quarter"})
    expect(stepMarker(emptyPattern(), 2)).toEqual({label: "&", size: "eighth"})
    expect(stepMarker(emptyPattern(), 3)).toEqual({label: "a", size: "sixteenth"})
    expect(stepMarker(emptyPattern(1, "6/8"), 6)).toEqual({label: "1.4", size: "quarter"})
  })
  it("loops the audio scheduler at each meter's actual bar boundary", async () => {
    jasmine.clock().install()
    spyOn(window, "requestAnimationFrame").and.returnValue(1)
    spyOn(window, "cancelAnimationFrame")
    try {
      for (const [signature, meter] of Object.entries(TIME_SIGNATURES)) for (const bars of [1, 2]) {
        const audio = new DrumAudio(() => {})
        audio.context = {
          currentTime: 0, sampleRate: 1, resume: async () => {},
          createGain: () => ({gain: {}, connect() {}, disconnect() {}}),
          createBuffer: () => ({getChannelData: () => new Float32Array(1)})
        }
        const hits = []
        audio.hit = (id, time) => hits.push(time)
        const pattern = emptyPattern(bars, signature)
        pattern.bpm = 120
        pattern.tracks.kick[0] = true
        const loopSeconds = bars * meter.steps / meter.beatSteps * 0.5
        try {
          await audio.start(() => pattern, () => ({}), 0.7)
          for (let tick = 0; tick < Math.ceil((loopSeconds + 0.1) / 0.025); tick++) {
            audio.context.currentTime += 0.025
            jasmine.clock().tick(25)
          }
          expect(hits.length).toBe(2)
          expect(hits[1] - hits[0]).toBeCloseTo(loopSeconds, 8)
        } finally { audio.stop() }
      }
    } finally { jasmine.clock().uninstall() }
  })
})


describe("Drum preset coverage", () => {
  it("provides two distinct playable grooves in each new meter", () => {
    for (const signature of ["3/4", "5/4", "6/8"]) {
      const presets = PRESETS.filter(item => item.pattern.timeSignature === signature)
      expect(presets.length).toBe(2)
      expect(presets[0].pattern.tracks).not.toEqual(presets[1].pattern.tracks)
      for (const {pattern} of presets) {
        expect(validatePattern(pattern)).toEqual(pattern)
        expect(pattern.tracks.kick.some(Boolean)).toBeTrue()
        expect(pattern.tracks.snare.some(Boolean)).toBeTrue()
      }
    }
  })
})

describe("Drum saved-pattern controls", () => {
  let page, storage
  beforeEach(() => {
    storage = {getItem: () => null, setItem: jasmine.createSpy("setItem")}
    spyOnProperty(window, "localStorage", "get").and.returnValue(storage)
    page = new DrumMachinePage({})
    page.setState = (update, callback) => {
      Object.assign(page.state, typeof update === "function" ? update(page.state) : update)
      if (callback) callback()
    }
  })
  it("saves a new pattern, selects it, and overwrites it without duplicating the entry", () => {
    page.changePattern(emptyPattern(1, "5/4"))
    page.state.name = "Five alive"
    page.save()
    expect(page.state.selectedName).toBe("Five alive")
    page.state.pattern.tracks.kick[19] = true
    page.save()
    const saved = JSON.parse(storage.setItem.calls.mostRecent().args[1])
    expect(saved.length).toBe(1)
    expect(saved[0].pattern.timeSignature).toBe("5/4")
    expect(saved[0].pattern.tracks.kick[19]).toBeTrue()
  })
  it("loads a selected pattern including its meter without editing the stored copy", () => {
    page.state.saved = [{name: "Six", pattern: emptyPattern(2, "6/8")}]
    page.loadSaved("Six")
    expect(page.state.selectedName).toBe("Six")
    expect(page.state.pattern.timeSignature).toBe("6/8")
    expect(page.state.pattern.bars).toBe(2)
    page.state.pattern.tracks.kick[0] = true
    expect(page.state.saved[0].pattern.tracks.kick[0]).toBeFalse()
  })
  it("creates a blank draft with a unique name and retains meter, length, tempo, and swing", () => {
    page.state.saved = [{name: "My beat", pattern: emptyPattern()}]
    page.state.selectedName = "My beat"
    const pattern = emptyPattern(2, "3/4")
    pattern.bpm = 135
    pattern.swing = 0.2
    pattern.tracks.snare[0] = true
    page.changePattern(pattern)
    page.newPattern()
    expect(page.state.selectedName).toBe("")
    expect(page.state.name).toBe("My beat 2")
    expect(page.state.pattern).toEqual({...emptyPattern(2, "3/4"), bpm: 135, swing: 0.2})
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(page.state.saved.length).toBe(1)
  })
  it("deletes only the selected save and preserves the editable beat", () => {
    page.state.saved = [{name: "A", pattern: emptyPattern()}, {name: "B", pattern: emptyPattern(1, "6/8")}]
    page.loadSaved("B")
    const pattern = page.state.pattern
    page.deleteSelected()
    expect(page.state.saved.map(item => item.name)).toEqual(["A"])
    expect(page.state.selectedName).toBe("")
    expect(page.state.pattern).toBe(pattern)
    expect(JSON.parse(storage.setItem.calls.mostRecent().args[1]).length).toBe(1)
  })
  it("keeps selection and saved data unchanged if saving or deleting fails", () => {
    page.state.saved = [{name: "A", pattern: emptyPattern()}]
    page.loadSaved("A")
    const saved = page.state.saved
    storage.setItem.and.throwError("Storage full")
    page.deleteSelected()
    expect(page.state.selectedName).toBe("A")
    expect(page.state.saved).toBe(saved)
    expect(page.state.message).toContain("Could not save")
    page.newPattern()
    page.save()
    expect(page.state.selectedName).toBe("")
    expect(page.state.saved).toBe(saved)
  })
})
