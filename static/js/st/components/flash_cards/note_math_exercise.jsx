import {keyCodeToChar} from "st/keyboard_input"
import {parseNote} from "st/music"

import {CardHolder} from "st/components/flash_cards/common"
import Keyboard from "st/components/keyboard"

import * as React from "react"
import classNames from "classnames"
import MersenneTwister from "mersennetwister"
import {shuffled} from "st/util"
import settingsPanelStyles from "st/components/settings_panel.module.css"
import flashCardStyles from "st/components/flash_cards/flash_cards.module.css"
import staffStyles from "st/components/staff.module.css"

import * as types from "prop-types"

export const NATURAL_NOTES = ["C", "D", "E", "F", "G", "A", "B"]
const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11]
export const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
export const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
const ACCIDENTAL_PITCHES = [1, 3, 6, 8, 10]
const ROOT_LABELS = {
  "C#": "C#/Db",
  "D#": "D#/Eb",
  "F#": "F#/Gb",
  "G#": "G#/Ab",
  "A#": "A#/Bb",
}

// The original cards count through note names rather than assuming a major key.
// These offsets retain that behavior for natural-only practice.
const DIATONIC_INTERVALS = [
  {label: "2", steps: 1},
  {label: "3", steps: 2},
  {label: "4", steps: 3},
  {label: "5", steps: 4},
  {label: "6", steps: 5},
  {label: "7", steps: 6},
]

const ACCIDENTAL_INTERVALS = [
  {label: "min 2", steps: 1},
  {label: "aug 2", steps: 3},
  {label: "min 3", steps: 3},
  {label: "dim 5", steps: 6},
  {label: "aug 5", steps: 8},
  {label: "min 6", steps: 8},
  {label: "dim 7", steps: 9},
  {label: "bb7", steps: 9},
  {label: "min 7", steps: 10},
  {label: "#9", steps: 3},
]

export function pitchClass(note) {
  return ((parseNote(`${note}5`) % 12) + 12) % 12
}

export function diatonicAnswerPitch(rootLabel, steps) {
  let rootIndex = NATURAL_NOTES.indexOf(rootLabel[0])
  return NATURAL_PITCHES[(rootIndex + steps) % NATURAL_NOTES.length]
}

export default class NoteMathExercise extends React.PureComponent {
  static exerciseName = "Note Math"
  static exerciseId = "note_math"

  static propTypes = {
    settings: types.object.isRequired,
  }

  static defaultSettings() {
    return {
      enabledRoots: {"D": true},
      accidentals: false,
      randomizeAccidentals: false,
      virtualMidiKeyboard: false,
      intervalAccidentals: false,
    }
  }

  static ExerciseOptions = class extends React.PureComponent {
    static propTypes = {
      updateSettings: types.func.isRequired,
      currentSettings: types.object.isRequired,
    }

    updateToggle(name) {
      let settings = this.props.currentSettings
      let update = {[name]: !settings[name]}

      // Both dependent features require chromatic answers to be available.
      if (name == "accidentals" && settings.accidentals) {
        update.randomizeAccidentals = false
        update.intervalAccidentals = false
      } else if (name == "intervalAccidentals" && !settings.intervalAccidentals) {
        update.accidentals = true
      }

      this.props.updateSettings({...settings, ...update})
    }

    renderToggle(name, label, disabled=false) {
      let settings = this.props.currentSettings
      return <label className={classNames(flashCardStyles.test_group, {
        [flashCardStyles.selected]: settings[name],
        [flashCardStyles.disabled]: disabled,
      })}>
        <input
          type="checkbox"
          checked={settings[name] || false}
          disabled={disabled}
          onChange={() => this.updateToggle(name)} />
        {label}
      </label>
    }

    render() {
      let settings = this.props.currentSettings
      let notes = settings.accidentals ? SHARP_NAMES : NATURAL_NOTES
      let allRootsEnabled = notes.every(note => settings.enabledRoots[note])

      return <>
        <section className={settingsPanelStyles.settings_group}>
          <h4>Options</h4>
          <div className={flashCardStyles.option_list}>
            {this.renderToggle("accidentals", "Accidentals")}
            {this.renderToggle("randomizeAccidentals", "Randomize b/#", !settings.accidentals)}
            {this.renderToggle("intervalAccidentals", "Interval Accidentals")}
            {this.renderToggle("virtualMidiKeyboard", "Virtual MIDI Keyboard")}
          </div>
        </section>
        <section className={settingsPanelStyles.settings_group}>
          <h4>Root notes</h4>
          <div className={settingsPanelStyles.button_group}>
            <label className={classNames(flashCardStyles.test_group, {
              [flashCardStyles.selected]: allRootsEnabled,
            })}>
              <input
                type="checkbox"
                checked={allRootsEnabled}
                onChange={() => this.props.updateSettings({
                  ...settings,
                  enabledRoots: allRootsEnabled
                    ? {"C": true}
                    : Object.fromEntries(notes.map(note => [note, true])),
                })} />
              All
            </label>
            {notes.map((note) =>
              <label
                key={note}
                className={classNames(flashCardStyles.test_group, {
                  [flashCardStyles.selected]: settings.enabledRoots[note]
                })}>
                <input
                  type="checkbox"
                  checked={settings.enabledRoots[note] || false}
                  onChange={() => this.props.updateSettings({
                    ...settings,
                    enabledRoots: {
                      ...settings.enabledRoots,
                      [note]: !settings.enabledRoots[note]
                    }
                  })} />
                {ROOT_LABELS[note] || note}
              </label>
            )}
          </div>
        </section>
      </>
    }
  }

  constructor(props) {
    super(props)
    this.state = {cardNumber: 0}
    this.rand = new MersenneTwister()
    this.pressKeyboardNote = this.pressKeyboardNote.bind(this)
  }

  componentDidMount() {
    this.showNext(this.refreshCards())

    this.upListener = event => {
      if (this.props.settings.virtualMidiKeyboard) {
        return
      }

      let key = keyCodeToChar(event.keyCode)
      if (key == null || !this.refs.cardOptions) {
        return
      }

      if (key.match(/^\d$/)) {
        let button = this.refs.cardOptions.children[(+key) - 1]
        if (button) button.click()
      } else {
        for (let button of this.refs.cardOptions.children) {
          if (button.textContent == key.toUpperCase()) button.click()
        }
      }
    }
    window.addEventListener("keyup", this.upListener)
  }

  componentWillUnmount() {
    window.removeEventListener("keyup", this.upListener)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.settings != this.props.settings) {
      this.refreshCards(() => this.showNext())
    }
  }

  render() {
    let card = this.state.currentCard
    let errorMessage = card ? null : <strong className={flashCardStyles.no_cards_error}>Please enable some cards from settings</strong>

    return <div className={classNames("note_math_exercise flash_card_exercise", {
      [flashCardStyles.with_keyboard]: this.props.settings.virtualMidiKeyboard,
    })}>
      {errorMessage}
      <CardHolder>{this.renderCurrentCard()}</CardHolder>
      {this.props.settings.virtualMidiKeyboard ? this.renderKeyboard() : this.renderCardOptions()}
    </div>
  }

  renderCurrentCard() {
    let card = this.state.currentCard
    if (!card) return

    return <div key={this.state.cardNumber} className={flashCardStyles.card_row}>
      <div className={classNames(flashCardStyles.flash_card, {
        [staffStyles.errorshake]: this.state.cardError,
      })}>
        {card.label}
      </div>
    </div>
  }

  renderCardOptions() {
    let card = this.state.currentCard
    if (!card) return

    return <div className={flashCardStyles.card_options} ref="cardOptions">
      {card.options.map(option =>
        <button
          key={option.pitch}
          disabled={this.state.cardMistakes && this.state.cardMistakes[option.pitch]}
          onClick={e => {
            e.preventDefault()
            this.checkAnswer(option.pitch)
          }}>
          {option.label}
        </button>
      )}
    </div>
  }

  renderKeyboard() {
    if (!this.state.currentCard) return

    return <Keyboard
      className={flashCardStyles.note_math_keyboard}
      lower="C4"
      upper="B5"
      onKeyDown={this.pressKeyboardNote} />
  }

  pressKeyboardNote(note) {
    this.checkAnswer(pitchClass(note.replace(/\d+$/, "")))
  }

  normalizeScores() {
    let minScore = Math.min(...this.state.cards.map(card => card.score)) - 1
    if (minScore == 0) return
    for (let card of this.state.cards) card.score -= minScore
  }

  refreshCards(fn) {
    let settings = this.props.settings
    let enabledRoots = settings.enabledRoots
    let chromatic = settings.accidentals
    let rootNames = chromatic ? SHARP_NAMES : NATURAL_NOTES
    let rootPitches = chromatic ? SHARP_NAMES.map(pitchClass) : NATURAL_PITCHES
    let intervals = settings.intervalAccidentals
      ? DIATONIC_INTERVALS.concat(ACCIDENTAL_INTERVALS)
      : DIATONIC_INTERVALS
    let cards = []

    rootNames.forEach((rootName, rootIndex) => {
      if (!enabledRoots[rootName]) return

      intervals.forEach(interval => {
        cards.push({
          score: 1,
          intervalLabel: interval.label,
          rootPitch: rootPitches[rootIndex],
          chromaticInterval: ACCIDENTAL_INTERVALS.includes(interval),
          steps: interval.steps,
        })
      })
    })

    this.setState({cardOrder: null, cards}, fn)
    return cards
  }

  noteNamesForTurn() {
    if (!this.props.settings.accidentals) return SHARP_NAMES
    if (!this.props.settings.randomizeAccidentals) return SHARP_NAMES

    let useSharps = ACCIDENTAL_PITCHES.map(() => this.rand.random() < 0.5)
    // "Randomize" should visibly mix both spellings instead of occasionally
    // producing an all-sharp or all-flat row by chance.
    if (useSharps.every(Boolean)) useSharps[useSharps.length - 1] = false
    if (useSharps.every(value => !value)) useSharps[useSharps.length - 1] = true

    return SHARP_NAMES.map((name, pitch) => {
      if (!ACCIDENTAL_PITCHES.includes(pitch)) return name
      let accidentalIndex = ACCIDENTAL_PITCHES.indexOf(pitch)
      return useSharps[accidentalIndex] ? SHARP_NAMES[pitch] : FLAT_NAMES[pitch]
    })
  }

  showNext(cards=this.state.cards) {
    if (!cards || cards.length == 0) {
      this.setState({currentCard: null})
      return
    }

    let cardOrder = this.state.cardOrder ? [...this.state.cardOrder] : []
    if (cardOrder.length <= 1) {
      let moreCards = shuffled(cards.map((_, idx) => idx))
      if (moreCards[0] == cardOrder[cardOrder.length - 1]) moreCards.reverse()
      cardOrder = cardOrder.concat(moreCards)
    }

    let card = cards[cardOrder.shift()]
    let noteNames = this.noteNamesForTurn()
    let rootLabel = noteNames[card.rootPitch]
    let answerPitch = card.chromaticInterval
      ? (card.rootPitch + card.steps) % 12
      : diatonicAnswerPitch(rootLabel, card.steps)
    let options = (this.props.settings.accidentals ? noteNames : NATURAL_NOTES)
      .map(label => ({label, pitch: pitchClass(label)}))

    this.setState({
      cardMistakes: null,
      cardError: false,
      cardNumber: this.state.cardNumber + 1,
      currentCard: {
        ...card,
        sourceCard: card,
        answerPitch,
        label: `${card.intervalLabel} of ${rootLabel} is`,
        options,
      },
      cardOrder,
    })
  }

  checkAnswer(answerPitch) {
    if (!this.state.currentCard) return

    if (answerPitch == this.state.currentCard.answerPitch) {
      if (!this.state.cardMistakes) {
        this.state.currentCard.sourceCard.score += 1
        this.normalizeScores()
      }
      this.showNext()
      return
    }

    let card = this.state.currentCard
    let cardNumber = this.state.cardNumber
    if (!this.state.cardMistakes) {
      card.sourceCard.score -= 1
      this.normalizeScores()
    }

    this.setState({
      cardMistakes: {...this.state.cardMistakes, [answerPitch]: true},
      cardError: true,
    })

    window.setTimeout(() => {
      if (this.state.cardNumber == cardNumber) this.setState({cardError: false})
    }, 600)
  }
}
