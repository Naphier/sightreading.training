export const DRUM_KITS = [
  {id: "classic", name: "Classic"},
  {id: "rock", name: "Heavy Rock"},
  {id: "wood", name: "Woodblocks"},
  {id: "jazz", name: "Jazz"}
]

const tone = (frequency, endFrequency, decay, gain, type = "sine") => ({type, frequency, endFrequency, decay, gain})
const noise = (decay, gain, filterFrequency, filter = "highpass", attack = 0) => ({type: "noise", decay, gain, filterFrequency, filter, attack})
const metal = (base, decay, gain) => [1, 1.47, 2.09, 2.71].map(ratio => tone(base * ratio, base * ratio, decay, gain / 4))

// Layered body/transient voices distinguish kits, rather than just changing pitch.
const ROCK = {
  kick: [tone(165, 42, 0.36, 0.65), tone(220, 65, 0.045, 0.14, "triangle"), noise(0.018, 0.07, 2500)],
  snare: [tone(210, 145, 0.14, 0.22, "triangle"), noise(0.22, 0.38, 1500)],
  closedHat: [noise(0.055, 0.19, 7200), ...metal(4300, 0.035, 0.045)],
  openHat: [noise(0.42, 0.19, 6000), ...metal(3800, 0.3, 0.05)],
  clap: [noise(0.025, 0.24, 1300), noise(0.16, 0.19, 1900, "bandpass", 0.018)],
  lowTom: [tone(145, 65, 0.4, 0.45), tone(220, 110, 0.14, 0.1, "triangle")],
  highTom: [tone(230, 120, 0.28, 0.38), tone(340, 190, 0.09, 0.09, "triangle")],
  ride: [...metal(2400, 0.7, 0.16), noise(0.5, 0.07, 5000)]
}

const WOOD = Object.fromEntries(Object.entries({kick: 330, snare: 650, closedHat: 1200, openHat: 950, clap: 800, lowTom: 440, highTom: 880, ride: 1550}).map(([id, pitch]) => [id, [
  tone(pitch, pitch * 0.98, id === "openHat" || id === "ride" ? 0.16 : 0.085, 0.35),
  tone(pitch * 2.37, pitch * 2.3, 0.035, 0.12, "triangle")
]]))

const JAZZ = {
  kick: [tone(105, 48, 0.18, 0.4), noise(0.018, 0.025, 700, "lowpass")],
  snare: [noise(0.3, 0.19, 2600, "bandpass", 0.008), tone(180, 150, 0.08, 0.06)],
  closedHat: [noise(0.035, 0.1, 8500), ...metal(5100, 0.04, 0.025)],
  openHat: [noise(0.19, 0.12, 7500), ...metal(4100, 0.24, 0.04)],
  clap: [tone(1050, 850, 0.035, 0.14, "triangle"), noise(0.045, 0.08, 1800, "bandpass")],
  lowTom: [tone(155, 110, 0.25, 0.26), tone(240, 220, 0.1, 0.045)],
  highTom: [tone(235, 175, 0.2, 0.24), tone(350, 330, 0.08, 0.04)],
  ride: [...metal(1900, 0.95, 0.2), noise(0.55, 0.035, 6500)]
}

export const KIT_VOICES = {rock: ROCK, wood: WOOD, jazz: JAZZ}
