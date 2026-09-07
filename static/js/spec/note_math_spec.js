import {
  NATURAL_NOTES,
  SHARP_NAMES,
  FLAT_NAMES,
  pitchClass,
  diatonicAnswerPitch,
} from "st/components/flash_cards/note_math_exercise"

describe("Note Math", function() {
  it("maps every natural root to a defined diatonic answer", function() {
    for (let root of NATURAL_NOTES) {
      for (let steps = 1; steps <= 6; steps++) {
        let answer = diatonicAnswerPitch(root, steps)
        expect(answer).toBeDefined()
        expect(NATURAL_NOTES.map(pitchClass)).toContain(answer)
      }
    }
  })

  it("counts intervals by note letter instead of chromatic array index", function() {
    expect(diatonicAnswerPitch("A", 3)).toBe(pitchClass("D"))
    expect(diatonicAnswerPitch("A", 5)).toBe(pitchClass("F"))
    expect(diatonicAnswerPitch("D", 6)).toBe(pitchClass("C"))
  })

  it("supports sharp and flat spellings for all twelve pitch classes", function() {
    expect(SHARP_NAMES.map(pitchClass)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(FLAT_NAMES.map(pitchClass)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })
})
