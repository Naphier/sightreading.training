import * as React from "react"

import {setTitle} from "st/globals"
import {chordNote, guitarVoicing, identifyChords} from "st/chord_lab"
import styles from "./chord_lab_page.module.css"

const STRINGS = ["Low E", "A", "D", "G", "B", "High E"]
const FRETS = Array.from({length: 25}, (_, fret) => fret)
const EXAMPLES = {
  "C major": [null, 3, 2, 0, 1, 0],
  "D minor": [null, null, 0, 2, 3, 1],
  "G7": [3, 2, 0, 0, 0, 1],
  "C over E": [0, 3, 2, 0, 1, 0],
}

export default class ChordLabPage extends React.Component {
  state = {frets: STRINGS.map(() => null)}

  componentDidMount() {
    setTitle("Chord Lab")
  }

  render() {
    const {frets} = this.state
    const pitches = guitarVoicing(frets)
    const notes = [...new Set([...pitches].sort((a, b) => a - b).map(chordNote))]
    const matches = identifyChords(pitches)

    return <main className={styles.page}>
      <h1>Chord Lab</h1>
      <p>Choose a fret for each sounding string in standard tuning. Leave unused strings muted.</p>

      <div className={styles.strings}>
        {STRINGS.map((string, index) => <label key={string}>
          {string}
          <select value={frets[index] ?? "mute"} onChange={event => {
            const value = event.target.value
            this.setState(({frets}) => ({
              frets: frets.map((fret, position) =>
                position === index ? (value === "mute" ? null : Number(value)) : fret),
            }))
          }}>
            <option value="mute">Muted</option>
            {FRETS.map(fret => <option key={fret} value={fret}>
              {fret === 0 ? "Open (0)" : fret}
            </option>)}
          </select>
        </label>)}
      </div>

      <div className={styles.actions}>
        <label>Try an example
          <select value="" onChange={event => this.setState({frets: EXAMPLES[event.target.value]})}>
            <option value="" disabled>Select a voicing</option>
            {Object.keys(EXAMPLES).map(example => <option key={example}>{example}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => this.setState({frets: STRINGS.map(() => null)})}>
          Clear
        </button>
      </div>

      <section aria-live="polite">
        <h2>Chord matches</h2>
        {notes.length > 0 && <p>Notes from the bass up: {notes.join(" · ")}</p>}
        {notes.length < 3
          ? <p>Play at least three different notes to identify a chord.</p>
          : matches.length === 0
            ? <p>No exact match in the chord library. Check for an extra or missing note.</p>
            : <ul>{matches.map(match => <li key={match}>{match}</li>)}</ul>}
      </section>
      <p>Matches use every distinct note you enter. A slash shows the bass note when it differs from the chord root.</p>
    </main>
  }
}
