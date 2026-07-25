import * as React from "react"
import classNames from "classnames"
import * as types from "prop-types"

import {setTitle} from "st/globals"
import {parseMidiMessage} from "st/midi"

import pageContainerStyles from "../page_container.module.css"
import styles from "./midi_monitor.module.css"

export default class MidiMonitorPage extends React.Component {
  static propTypes = {
    midi: types.object,
    midiInput: types.object,
  }

  constructor(props) {
    super(props)
    this.state = {
      events: [],
      maxEvents: 100,
      filters: {
        noteOn: true,
        noteOff: true,
        dataEntry: true,
        other: true
      },
      autoScroll: true
    }
    this.eventCount = 0
    this.tableRef = React.createRef()

    this.midiMessageListener = this.handleMidiEvent.bind(this)
    this.stateChangeListener = () => {
      this.attachInputs()
      this.forceUpdate()
    }
  }

  componentDidMount() {
    setTitle("MIDI Monitor")
    this.attachMidi(this.props.midi)
  }

  componentDidUpdate(prevProps) {
    // MIDI access resolves asynchronously, so it can arrive after mount
    if (prevProps.midi != this.props.midi) {
      this.detachMidi(prevProps.midi)
      this.attachMidi(this.props.midi)
    }
  }

  componentWillUnmount() {
    this.detachMidi(this.props.midi)
  }

  attachMidi(midi) {
    if (!midi) return
    midi.addEventListener("statechange", this.stateChangeListener)
    this.attachInputs()
  }

  detachMidi(midi) {
    if (!midi) return
    midi.removeEventListener("statechange", this.stateChangeListener)
    for (let input of midi.inputs.values()) {
      input.removeEventListener("midimessage", this.midiMessageListener)
    }
  }

  // addEventListener is used so the selected device's onmidimessage handler
  // owned by the app layout is left intact. Re-adding the same listener is a
  // no-op, so this is safe to call on every statechange
  attachInputs() {
    if (!this.props.midi) return
    for (let input of this.props.midi.inputs.values()) {
      input.addEventListener("midimessage", this.midiMessageListener)
    }
  }

  handleMidiEvent(message) {
    const timestamp = performance.now()
    const parsed = parseMidiMessage(message)

    if (!parsed) return

    const [eventType, note, channel, velocity] = parsed
    const [raw, pitch, velocityVal] = message.data

    const event = {
      id: this.eventCount++,
      timestamp: timestamp,
      timeDelta: this.state.events.length > 0 ?
        timestamp - this.state.events[this.state.events.length - 1].timestamp : 0,
      source: message.target ? message.target.name : "Unknown",
      raw: Array.from(message.data),
      eventType: eventType,
      note: note,
      channel: channel,
      velocity: velocity || velocityVal,
      pitch: pitch
    }

    this.setState(prevState => {
      const newEvents = [...prevState.events, event]
      if (newEvents.length > prevState.maxEvents) {
        newEvents.shift()
      }
      return { events: newEvents }
    }, () => {
      if (this.state.autoScroll && this.tableRef.current) {
        const container = this.tableRef.current.parentElement
        container.scrollTop = container.scrollHeight
      }
    })
  }

  clearEvents() {
    this.setState({ events: [] })
    this.eventCount = 0
  }

  toggleFilter(filterType) {
    this.setState(prevState => ({
      filters: {
        ...prevState.filters,
        [filterType]: !prevState.filters[filterType]
      }
    }))
  }

  shouldShowEvent(event) {
    switch (event.eventType) {
      case "noteOn":
        return this.state.filters.noteOn
      case "noteOff":
        return this.state.filters.noteOff
      case "dataEntry":
        return this.state.filters.dataEntry
      default:
        return this.state.filters.other
    }
  }

  formatTimeDelta(delta) {
    return delta.toFixed(2) + "ms"
  }

  formatHex(data) {
    return data.map(byte => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ")
  }

  formatDecimal(data) {
    return data.join(" ")
  }

  getMidiMessageType(eventType, pitch) {
    switch (eventType) {
      case "noteOn":
        return "Note ON"
      case "noteOff":
        return "Note OFF"
      case "dataEntry":
        if (pitch === 64) return "Sustain"
        return "Controller"
      default:
        return "Unknown"
    }
  }

  midiInputs() {
    if (!this.props.midi) return []
    return [...this.props.midi.inputs.values()]
  }

  renderDeviceList() {
    const inputs = this.midiInputs()

    if (inputs.length == 0) {
      return <p>No MIDI input devices are connected. Devices will be picked up automatically when plugged in.</p>
    }

    const selected = this.props.midiInput

    return <p className={styles.device_list}>
      Listening to all connected inputs:
      {" "}
      {inputs.map((input, i) => (
        <React.Fragment key={input.id}>
          {i > 0 && ", "}
          <strong>{input.name}</strong>
          {selected && selected.id == input.id && " (selected)"}
        </React.Fragment>
      ))}
    </p>
  }

  renderFilters() {
    return (
      <div className={styles.filter_controls}>
        <span className={styles.filter_label}>Show:</span>
        {Object.entries(this.state.filters).map(([key, value]) => (
          <label key={key} className={styles.filter_checkbox}>
            <input
              type="checkbox"
              checked={value}
              onChange={() => this.toggleFilter(key)}
            />
            <span className={styles.filter_name}>
              {key === "noteOn" ? "Note On" :
               key === "noteOff" ? "Note Off" :
               key === "dataEntry" ? "Controllers" :
               "Other"}
            </span>
          </label>
        ))}
      </div>
    )
  }

  renderControls() {
    return (
      <div className={styles.debug_controls}>
        {this.renderFilters()}
        <div className={styles.control_buttons}>
          <label className={styles.auto_scroll_checkbox}>
            <input
              type="checkbox"
              checked={this.state.autoScroll}
              onChange={(e) => this.setState({ autoScroll: e.target.checked })}
            />
            <span>Auto-scroll</span>
          </label>
          <button onClick={() => this.clearEvents()}>
            Clear Events ({this.state.events.length})
          </button>
        </div>
      </div>
    )
  }

  renderMonitor() {
    const filteredEvents = this.state.events.filter(event => this.shouldShowEvent(event))

    return <div>
      {this.renderDeviceList()}
      {this.renderControls()}

      <div className={styles.events_table_container}>
        <table ref={this.tableRef} className={styles.events_table}>
          <thead>
            <tr>
              <th>Time Δ</th>
              <th>Source</th>
              <th>Data (hex)</th>
              <th>Data (dec)</th>
              <th>Ch</th>
              <th>Message</th>
              <th>Note</th>
              <th>Velocity</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map(event => (
              <tr key={event.id} className={styles["event_" + event.eventType]}>
                <td className={styles.time_delta}>{this.formatTimeDelta(event.timeDelta)}</td>
                <td className={styles.source}>{event.source}</td>
                <td className={styles.data_hex}>{this.formatHex(event.raw)}</td>
                <td className={styles.data_dec}>{this.formatDecimal(event.raw)}</td>
                <td className={styles.channel}>{event.channel !== undefined ? event.channel + 1 : "-"}</td>
                <td className={styles.message_type}>{this.getMidiMessageType(event.eventType, event.pitch)}</td>
                <td className={styles.note}>{event.note || event.pitch || "-"}</td>
                <td className={styles.velocity}>{event.velocity || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredEvents.length === 0 && (
        <div className={styles.no_events}>
          {this.state.events.length === 0 ?
            "No MIDI events received yet. Play some notes on your MIDI device." :
            "No events match the current filters."
          }
        </div>
      )}
    </div>
  }

  render() {
    let body

    if (this.props.midi) {
      body = this.renderMonitor()
    } else if (navigator.requestMIDIAccess) {
      body = <p>Waiting for MIDI access...</p>
    } else {
      body = <p><strong>MIDI support not detected in your browser.</strong> Try Chrome for MIDI device support.</p>
    }

    return <div className={classNames(pageContainerStyles.page_container, styles.midi_monitor_page)}>
      <h2>MIDI Monitor</h2>
      <p>Shows incoming events from every connected MIDI input, regardless of
      which device is selected. Use this to verify your device is sending data
      and to see which port it arrives on.</p>
      {body}
    </div>
  }
}
