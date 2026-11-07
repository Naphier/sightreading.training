import {guitarVoicing, identifyChords} from "st/chord_lab"

describe("Chord Lab", () => {
  it("matches an open C voicing with doubled notes and a muted string", () => {
    const pitches = guitarVoicing([null, 3, 2, 0, 1, 0])
    expect(pitches.length).toBe(5)
    expect(identifyChords(pitches)).toEqual(["C"])
  })

  it("uses the lowest pitch even when a lower string is fretted above it", () => {
    const pitches = guitarVoicing([24, 3, 2, 0, 1, 0])
    expect(identifyChords(pitches)).toEqual(["C"])
    expect(identifyChords(guitarVoicing([0, 3, 2, 0, 1, 0]))).toEqual(["C/E"])
  })

  it("keeps alternate exact names and orders the bass-root match first", () => {
    expect(identifyChords([60, 64, 67, 69])).toEqual(["C6", "Am7/C"])
  })

  it("recognizes suspended and extended chords without accepting extra tones", () => {
    expect(identifyChords([60, 65, 67])).toContain("Csus4")
    expect(identifyChords([60, 64, 67, 70, 74])).toContain("C9")
    expect(identifyChords([60, 64, 65, 67])).toEqual([])
    expect(identifyChords([])).toEqual([])
  })
})
