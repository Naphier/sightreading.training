import {TRACKS, stepDuration} from "./drum_patterns"

// Schedule against the audio clock, independently of React renders.
export default class DrumAudio {
  constructor(onStep) {
    this.onStep = onStep
    this.pending = []
  }

  async start(getPattern, getMuted, volume) {
    this.stop()
    const token = this.token
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!this.context && !AudioContext) throw new Error("This browser does not support Web Audio.")
    this.context ||= new AudioContext()
    await this.context.resume()
    if (token !== this.token) return false
    this.master = this.context.createGain()
    this.master.gain.value = volume
    this.master.connect(this.context.destination)
    this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.step = 0
    this.nextTime = this.context.currentTime + 0.04
    const schedule = () => {
      const pattern = getPattern()
      const now = this.context.currentTime
      // Skip missed time after browser throttling instead of bursting queued hits.
      if (this.nextTime < now) this.nextTime = now + 0.02
      while (this.nextTime < now + 0.1) {
        this.step %= pattern.bars * 16
        const step = this.step
        for (const [id] of TRACKS) {
          if (pattern.tracks[id][step] && !getMuted()[id]) this.hit(id, this.nextTime)
        }
        this.pending.push({step, time: this.nextTime})
        this.nextTime += stepDuration(pattern.bpm, pattern.swing, step)
        this.step++
      }
    }
    const draw = () => {
      while (this.pending.length && this.pending[0].time <= this.context.currentTime) this.onStep(this.pending.shift().step)
      this.frame = requestAnimationFrame(draw)
    }
    schedule()
    this.timer = setInterval(schedule, 25)
    draw()
    return true
  }

  hit(id, time) {
    const ctx = this.context
    const tonal = ["kick", "lowTom", "highTom"].includes(id)
    const length = {kick: 0.25, snare: 0.16, clap: 0.12, closedHat: 0.045, openHat: 0.3, ride: 0.4, lowTom: 0.22, highTom: 0.18}[id]
    const source = tonal ? ctx.createOscillator() : ctx.createBufferSource()
    const envelope = ctx.createGain()
    if (tonal) {
      const pitch = {kick: 140, lowTom: 150, highTom: 230}[id]
      source.frequency.setValueAtTime(pitch, time)
      source.frequency.exponentialRampToValueAtTime(id === "kick" ? 45 : pitch * 0.5, time + length)
    } else {
      source.buffer = this.noise
    }
    const filter = ctx.createBiquadFilter()
    filter.type = tonal ? "lowpass" : "highpass"
    filter.frequency.value = tonal ? 1500 : id === "snare" || id === "clap" ? 1000 : 6500
    envelope.gain.setValueAtTime(tonal ? 0.8 : 0.3, time)
    envelope.gain.exponentialRampToValueAtTime(0.001, time + length)
    source.connect(filter).connect(envelope).connect(this.master)
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect() }
    source.start(time)
    source.stop(time + length)
  }

  setVolume(value) {
    if (this.master) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.01)
  }

  stop() {
    this.token = (this.token || 0) + 1
    clearInterval(this.timer)
    cancelAnimationFrame(this.frame)
    this.pending = []
    if (this.master) { this.master.disconnect(); this.master = null }
  }

  dispose() {
    this.stop()
    if (this.context) this.context.close()
  }
}
