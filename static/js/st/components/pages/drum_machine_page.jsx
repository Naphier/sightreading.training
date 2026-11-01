import * as React from "react"
import {setTitle} from "st/globals"
import DrumAudio from "st/drum_audio"
import {TRACKS, PRESETS, STORAGE_KEY, emptyPattern, validatePattern, resizePattern, readSavedPatterns} from "st/drum_patterns"
import styles from "./drum_machine_page.module.css"

export default class DrumMachinePage extends React.Component {
  constructor(props) {
    super(props)
    let saved = [], message = ""
    try { saved = readSavedPatterns(window.localStorage) }
    catch { message = "Saved patterns could not be read. You can still create and play beats." }
    this.state = {pattern: validatePattern(PRESETS[0].pattern), tempoInput: String(PRESETS[0].pattern.bpm), saved, name: "My beat", muted: {}, volume: 0.7, playing: false, starting: false, currentStep: -1, message}
    this.audio = new DrumAudio(currentStep => this.setState({currentStep}))
  }

  componentDidMount() { setTitle("Drum Machine") }
  componentWillUnmount() { this.unmounted = true; this.audio.dispose() }

  changePattern(pattern) { this.setState({pattern, tempoInput: String(pattern.bpm)}) }

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

  save() {
    const name = this.state.name.trim()
    if (!name) { this.setState({message: "Enter a name before saving."}); return }
    if (this.state.saved.length >= 100 && !this.state.saved.some(item => item.name === name)) {
      this.setState({message: "You can save up to 100 patterns. Delete one to make room."}); return
    }
    const saved = [...this.state.saved.filter(item => item.name !== name), {name, pattern: validatePattern(this.state.pattern)}]
    this.persist(saved, `Saved “${name}” on this browser.`)
  }

  persist(saved, message) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
      this.setState({saved, message})
    } catch { this.setState({message: "Could not save changes. Browser storage may be full or unavailable."}) }
  }

  render() {
    const {pattern, tempoInput, saved, name, muted, volume, playing, starting, currentStep, message} = this.state
    const steps = Array.from({length: pattern.bars * 16}, (_, i) => i)
    return <main className={styles.page}>
      <header className={styles.heading}>
        <div><h1>Drum Machine</h1><p>Find a groove. Make it your own.</p></div>
        <span className={styles.badge}>4/4 · 16th-note sequencer</span>
      </header>
      <section className={styles.panel} aria-label="Playback controls">
        <div className={styles.controls}>
          <button className={styles.play} onClick={() => this.togglePlayback()}>{playing || starting ? "■ Stop" : "▶ Play"}</button>
          <label>Tempo <input aria-label="Tempo BPM" type="number" min="30" max="240" step="any" value={tempoInput}
            onChange={e => this.changeTempo(e.target.value)} onBlur={() => this.commitTempo()}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); this.commitTempo() }
              if (e.key === "Escape") this.setState({tempoInput: String(pattern.bpm)})
            }} /> BPM</label>
          <label>Length <select value={pattern.bars} onChange={e => this.changePattern(resizePattern(pattern, Number(e.target.value)))}>
            <option value="1">1 bar</option><option value="2">2 bars</option>
          </select></label>
          <label>Swing {Math.round(pattern.swing * 100)}%<input aria-label="Swing" title="Delays offbeat eighth notes (&). 0% is straight; 33% is a triplet shuffle." type="range" min="0" max="50" value={Math.round(pattern.swing * 100)}
            onChange={e => this.changePattern({...pattern, swing: Number(e.target.value) / 100})} /></label>
          <label>Volume <input type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={e => {
            const value = Number(e.target.value) / 100
            this.setState({volume: value}); this.audio.setVolume(value)
          }} /></label>
        </div>
      </section>
      <section className={styles.panel} aria-label="Pattern editor">
        <div className={styles.sectionHeader}><h2>Build your beat</h2>
          <button onClick={() => this.changePattern({...emptyPattern(pattern.bars), bpm: pattern.bpm, swing: pattern.swing})}>Clear pattern</button>
        </div>
        <p className={styles.help}>Toggle steps to add hits. Mute individual tracks with their names. Two bars repeat the first bar when extended.</p>
        <div className={styles.scroll} tabIndex="0" aria-label="Scrollable drum steps">
          <table className={styles.grid}>
            <thead><tr><th scope="col">Instrument / mute</th>{steps.map(step => <th key={step} scope="col"
              className={currentStep === step ? styles.playhead : ""}>
              {step % 4 === 0 ? `${Math.floor(step / 16) + 1}.${step % 16 / 4 + 1}` : ["", "e", "&", "a"][step % 4]}
            </th>)}</tr></thead>
            <tbody>{TRACKS.map(([id, label]) => <tr key={id}>
              <th scope="row"><button aria-pressed={!!muted[id]} aria-label={`Mute ${label}`} className={muted[id] ? styles.muted : ""}
                onClick={() => this.setState({muted: {...muted, [id]: !muted[id]}})}>{label}{muted[id] ? " (muted)" : ""}</button></th>
              {steps.map(step => <td key={step} className={`${step % 4 === 0 ? styles.beat : ""} ${currentStep === step ? styles.playhead : ""}`}>
                <button className={`${styles.step} ${pattern.tracks[id][step] ? styles.active : ""}`}
                  aria-label={`${label}, bar ${Math.floor(step / 16) + 1}, beat ${Math.floor(step % 16 / 4) + 1}, sixteenth ${step % 4 + 1}`}
                  aria-pressed={pattern.tracks[id][step]} onClick={() => {
                    const row = [...pattern.tracks[id]]; row[step] = !row[step]
                    this.changePattern({...pattern, tracks: {...pattern.tracks, [id]: row}})
                  }}>{pattern.tracks[id][step] ? "●" : "·"}</button>
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <div className={styles.library}>
        <section className={styles.panel} aria-label="Preset patterns"><h2>Start with a groove</h2>
          <p>Load a preset, then edit any step. Presets also set tempo and swing.</p>
          <div className={styles.presets}>{PRESETS.map(preset => <button key={preset.name} onClick={() => {
            this.changePattern(validatePattern(preset.pattern)); this.setState({name: `${preset.name} variation`})
          }}>{preset.name}<small>{preset.pattern.bpm} BPM</small></button>)}</div>
        </section>
        <section className={styles.panel} aria-label="Saved patterns"><h2>Your patterns</h2>
          <p>Saved on this browser. Reusing a name replaces that saved pattern.</p>
          <form className={styles.save} onSubmit={e => { e.preventDefault(); this.save() }}>
            <label>Pattern name<input maxLength="60" value={name} onChange={e => this.setState({name: e.target.value})} /></label>
            <button type="submit">Save pattern</button>
          </form>
          {saved.length === 0 ? <p>No saved patterns yet.</p> : <ul className={styles.saved}>{saved.map(item => <li key={item.name}>
            <button onClick={() => { this.changePattern(validatePattern(item.pattern)); this.setState({name: item.name}) }}>{item.name}</button>
            <button aria-label={`Delete ${item.name}`} onClick={() => this.persist(saved.filter(p => p.name !== item.name), `Deleted “${item.name}”.`)}>Delete</button>
          </li>)}</ul>}
          <p role="status" className={styles.message}>{message}</p>
        </section>
      </div>
    </main>
  }
}
