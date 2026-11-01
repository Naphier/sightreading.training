import * as React from "react"
import {setTitle} from "st/globals"
import DrumAudio from "st/drum_audio"
import {TRACKS, PRESETS, STORAGE_KEY, emptyPattern, validatePattern, resizePattern, readSavedPatterns, TIME_SIGNATURES, meterFor, changeTimeSignature, stepMarker} from "st/drum_patterns"
import styles from "./drum_machine_page.module.css"

const TAGLINES = ["Find you groove", "Groovy", "Tss tss tssss", "Boom chucka", "Bum dum..."]

function DrumIcon({name}) {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {name === "play" && <path fill="currentColor" stroke="none" d="M7 4v16l14-8z" />}
    {name === "stop" && <rect fill="currentColor" stroke="none" x="5" y="5" width="14" height="14" rx="1" />}
    {name === "volume" && <><path d="M11 4 6 8H3v8h3l5 4zM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16" /></>}
    {name === "save" && <><path d="M5 3h12l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8M14 5v2" /></>}
    {name === "plus" && <path d="M12 5v14M5 12h14" />}
    {name === "trash" && <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>}
  </svg>
}

export default class DrumMachinePage extends React.Component {
  constructor(props) {
    super(props)
    let saved = [], message = ""
    try { saved = readSavedPatterns(window.localStorage) }
    catch { message = "Saved patterns could not be read. You can still create and play beats." }
    this.state = {pattern: validatePattern(PRESETS[0].pattern), tempoInput: String(PRESETS[0].pattern.bpm), saved, selectedName: "", name: "My beat", muted: {}, volume: 0.7, playing: false, starting: false, currentStep: -1, message}
    this.tagline = TAGLINES[Math.floor(Math.random() * TAGLINES.length)]
    this.audio = new DrumAudio(currentStep => this.setState({currentStep}))
  }

  componentDidMount() { setTitle("Drum Machine") }
  componentWillUnmount() { this.unmounted = true; this.audio.dispose() }

  changePattern(pattern) {
    const restart = (this.state.playing || this.state.starting) &&
      (pattern.timeSignature !== this.state.pattern.timeSignature || pattern.bars !== this.state.pattern.bars)
    if (restart) this.audio.stop()
    this.setState({pattern, tempoInput: String(pattern.bpm), ...(restart ? {playing: false, starting: false, currentStep: -1} : {})},
      () => { if (restart && !this.unmounted) this.togglePlayback() })
  }

  changeTempo(tempoInput) {
    this.setState(({pattern}) => {
      const bpm = Number(tempoInput)
      return {tempoInput, pattern: tempoInput.trim() && Number.isFinite(bpm) && bpm >= 30 && bpm <= 240 ? {...pattern, bpm} : pattern}
    })
  }

  commitTempo() {
    this.setState(({pattern, tempoInput}) => {
      const value = Number(tempoInput)
      const bpm = tempoInput.trim() && Number.isFinite(value) ? Math.max(30, Math.min(240, value)) : pattern.bpm
      return {pattern: {...pattern, bpm}, tempoInput: String(bpm)}
    })
  }

  async togglePlayback() {
    if (this.state.playing || this.state.starting) {
      this.audio.stop()
      this.setState({playing: false, starting: false, currentStep: -1})
      return
    }
    this.setState({starting: true, message: ""})
    try {
      const started = await this.audio.start(() => this.state.pattern, () => this.state.muted, this.state.volume)
      if (started && !this.unmounted) this.setState({playing: true, starting: false})
    } catch {
      this.audio.stop()
      if (!this.unmounted) this.setState({starting: false, message: "Audio could not start. Check browser audio permissions and try again."})
    }
  }

  newPattern() {
    const {pattern, saved} = this.state
    let name = "My beat", suffix = 2
    while (saved.some(item => item.name === name)) name = `My beat ${suffix++}`
    this.changePattern({...emptyPattern(pattern.bars, pattern.timeSignature), bpm: pattern.bpm, swing: pattern.swing})
    this.setState({selectedName: "", name, message: "New pattern. Add some hits and save it with a name."})
  }

  loadSaved(name) {
    const item = this.state.saved.find(item => item.name === name)
    if (!item) return
    this.changePattern(validatePattern(item.pattern))
    this.setState({selectedName: name, name, message: ""})
  }

  save() {
    const name = this.state.name.trim()
    if (!name) { this.setState({message: "Enter a name before saving."}); return }
    if (name.length > 60) { this.setState({message: "Use a name of 60 characters or fewer."}); return }
    if (this.state.saved.length >= 100 && !this.state.saved.some(item => item.name === name)) {
      this.setState({message: "You can save up to 100 patterns. Delete one to make room."}); return
    }
    const saved = [...this.state.saved.filter(item => item.name !== name), {name, pattern: validatePattern(this.state.pattern)}]
    this.persist(saved, `Saved “${name}” on this browser.`, {selectedName: name, name})
  }

  deleteSelected() {
    const {selectedName, saved} = this.state
    if (!selectedName) return
    this.persist(saved.filter(item => item.name !== selectedName), `Deleted “${selectedName}”. The current beat is still available to edit.`, {selectedName: ""})
  }

  persist(saved, message, state = {}) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
      this.setState({saved, message, ...state})
    } catch { this.setState({message: "Could not save changes. Browser storage may be full or unavailable."}) }
  }

  render() {
    const {pattern, tempoInput, saved, selectedName, name, muted, volume, playing, starting, currentStep, message} = this.state
    const meter = meterFor(pattern)
    const compound = pattern.timeSignature === "6/8"
    const steps = Array.from({length: pattern.bars * meter.steps}, (_, i) => i)
    return <main className={styles.page}>
      <header className={styles.heading}>
        <div><h1>Drum Machine</h1><p>{this.tagline}</p></div>
        <section className={styles.patternManager} aria-label="Saved patterns">
          <form className={styles.patternTools} onSubmit={e => { e.preventDefault(); this.save() }}>
            <label className={styles.patternPicker}>Your patterns
              <select aria-label="Your patterns" value={selectedName} onChange={e => this.loadSaved(e.target.value)}>
                <option value="" disabled>{saved.length ? "Unsaved pattern" : "No saved patterns yet"}</option>
                {saved.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <button type="submit" className={styles.iconButton} aria-label="Save pattern" title="Save pattern (an existing name replaces that saved pattern)"><DrumIcon name="save" /></button>
            <button type="button" className={styles.iconButton} aria-label="New pattern" title="New pattern" onClick={() => this.newPattern()}><DrumIcon name="plus" /></button>
            <button type="button" className={styles.iconButton} aria-label="Delete saved pattern" title="Delete selected saved pattern" disabled={!selectedName} onClick={() => this.deleteSelected()}><DrumIcon name="trash" /></button>
            {!selectedName && <input className={styles.patternName} aria-label="Pattern name" placeholder="Pattern name" maxLength="60" value={name} onChange={e => this.setState({name: e.target.value})} />}
          </form>
          <small>Saved on this browser.</small>
        </section>
      </header>
      <p role="status" className={styles.message}>{message}</p>
      <section className={styles.panel} aria-label="Playback controls">
        <div className={styles.controls}>
          <button className={`${styles.play} ${styles.iconButton}`} aria-label={playing || starting ? "Stop" : "Play"} title={playing || starting ? "Stop" : "Play"} onClick={() => this.togglePlayback()}><DrumIcon name={playing || starting ? "stop" : "play"} /></button>
          <label>Tempo <input aria-label="Tempo BPM" type="number" min="30" max="240" step="any" value={tempoInput}
            onChange={e => this.changeTempo(e.target.value)} onBlur={() => this.commitTempo()}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); this.commitTempo() }
              if (e.key === "Escape") this.setState({tempoInput: String(pattern.bpm)})
            }} /> {compound ? "BPM (♩.)" : "BPM (♩)"}</label>
          <label>Time signature <select value={pattern.timeSignature} onChange={e => this.changePattern(changeTimeSignature(pattern, e.target.value))}>
            {Object.keys(TIME_SIGNATURES).map(signature => <option key={signature} value={signature}>{signature}</option>)}
          </select></label>
          <label>Length <select value={pattern.bars} onChange={e => this.changePattern(resizePattern(pattern, Number(e.target.value)))}>
            <option value="1">1 bar</option><option value="2">2 bars</option>
          </select></label>
          <label>Swing {compound ? "Triplet feel" : `${Math.round(pattern.swing * 100)}%`}<input aria-label="Swing" disabled={compound} title={compound ? "6/8 uses straight triplet groups; swing applies to quarter-note meters." : "Delays offbeat eighth notes (&). 0% is straight; 33% is a triplet shuffle."} type="range" min="0" max="50" value={Math.round(pattern.swing * 100)}
            onChange={e => this.changePattern({...pattern, swing: Number(e.target.value) / 100})} /></label>
          <label title="Volume"><DrumIcon name="volume" /><input aria-label="Volume" type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={e => {
            const value = Number(e.target.value) / 100
            this.setState({volume: value}); this.audio.setVolume(value)
          }} /></label>
        </div>
      </section>
      <section className={styles.panel} aria-label="Pattern editor">
        <div className={styles.sectionHeader}><h2>Just beat it</h2>
          <button className={styles.iconButton} aria-label="Clear pattern" title="Clear pattern" onClick={() => this.changePattern({...emptyPattern(pattern.bars, pattern.timeSignature), bpm: pattern.bpm, swing: pattern.swing})}><DrumIcon name="trash" /></button>
        </div>
        <p className={styles.help}>Toggle steps to add hits. Mute individual tracks with their names. Two bars repeat the first bar when extended. {compound && "6/8: BPM counts dotted quarters; eighth notes are grouped 3 + 3."}</p>
        <div className={styles.scroll} tabIndex="0" aria-label="Scrollable drum steps">
          <table className={styles.grid}>
            <thead><tr><th scope="col">Instrument / mute</th>{steps.map(step => <th key={step} scope="col"
              className={`${styles[stepMarker(pattern, step).size]} ${currentStep === step ? styles.playhead : ""}`}>
              {stepMarker(pattern, step).label}
            </th>)}</tr></thead>
            <tbody>{TRACKS.map(([id, label]) => <tr key={id}>
              <th scope="row"><button aria-pressed={!!muted[id]} aria-label={`Mute ${label}`} className={muted[id] ? styles.muted : ""}
                onClick={() => this.setState({muted: {...muted, [id]: !muted[id]}})}>{label}{muted[id] ? " (muted)" : ""}</button></th>
              {steps.map(step => <td key={step} className={`${step % meter.beatSteps === 0 ? styles.beat : ""} ${currentStep === step ? styles.playhead : ""}`}>
                <button className={`${styles.step} ${pattern.tracks[id][step] ? styles.active : ""}`}
                  aria-label={`${label}, bar ${Math.floor(step / meter.steps) + 1}, beat ${Math.floor(step % meter.steps / meter.beatSteps) + 1}, sixteenth ${step % meter.beatSteps + 1}`}
                  aria-pressed={pattern.tracks[id][step]} onClick={() => {
                    const row = [...pattern.tracks[id]]; row[step] = !row[step]
                    this.changePattern({...pattern, tracks: {...pattern.tracks, [id]: row}})
                  }}>{pattern.tracks[id][step] ? "●" : "·"}</button>
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className={styles.panel} aria-label="Preset patterns"><h2>Start with a groove</h2>
        <p>Load a preset, then edit any step. Presets also set time signature, tempo, and swing.</p>
        <div className={styles.presets}>{PRESETS.map(preset => <button key={preset.name} onClick={() => {
          this.changePattern(validatePattern(preset.pattern)); this.setState({selectedName: "", name: `${preset.name} variation`, message: ""})
        }}>{preset.name}<small>{preset.pattern.timeSignature} · {preset.pattern.bpm} BPM</small></button>)}</div>
      </section>
    </main>
  }
}
