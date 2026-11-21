import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './App.css'

type Country = {
  id: string
  name: string
  code: string
  flag: string
  jury: number
  televote: number
  revealedJury: number
  revealedTelevote: number
}

type State = {
  title: string
  eventName: string
  phase: 'jury' | 'televote'
  visible: boolean
  lastAward: { from: string; to: string; points: number } | null
  countries: Country[]
}

async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function useStateSync() {
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    api('/api/state').then(setState)
    const events = new EventSource('/api/events')
    events.onmessage = (event) => setState(JSON.parse(event.data))
    return () => events.close()
  }, [])

  return state
}

function getTotal(country: Country, phase: State['phase']) {
  if (phase === 'jury') return country.revealedJury
  return country.revealedJury + country.revealedTelevote
}

function Admin() {
  const state = useStateSync()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [flag, setFlag] = useState('🏳️')
  const [awardTo, setAwardTo] = useState('')
  const [points, setPoints] = useState(12)

  if (!state) return <main className="loading">Loading SmileVision...</main>

  const updateCountry = async (id: string, patch: Partial<Country>) =>
    api(`/api/countries/${id}`, { method: 'PUT', body: JSON.stringify(patch) })

  const addCountry = async (event: FormEvent) => {
    event.preventDefault()
    await api('/api/countries', { method: 'POST', body: JSON.stringify({ name, code, flag }) })
    setName('')
    setCode('')
  }

  const award = async () => {
    if (!awardTo) return
    const country = state.countries.find((item) => item.id === awardTo)
    if (!country) return
    const patch = state.phase === 'jury'
      ? { jury: country.jury + points, revealedJury: country.revealedJury + points }
      : { televote: country.televote + points, revealedTelevote: country.revealedTelevote + points }
    await updateCountry(awardTo, patch)
    await api('/api/state', {
      method: 'PUT',
      body: JSON.stringify({ lastAward: { from: 'Presenter', to: country.name, points } }),
    })
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><strong>SMILE</strong>VISION</div>
        <nav>
          <button className="nav-item active">◫ <span>Control room</span></button>
        </nav>
        <div className="live-status"><span /> ONSCREEN {state.visible ? 'LIVE' : 'HIDDEN'}</div>
      </aside>

      <section className="admin-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">EVENT CONTROL</p>
            <h1>{state.eventName}</h1>
          </div>
          <div className="top-actions">
            <a className="button secondary" href="/overlay" target="_blank">Open overlay ↗</a>
            <button className="button" onClick={() => api('/api/state', { method: 'PUT', body: JSON.stringify({ visible: !state.visible }) })}>
              {state.visible ? 'Hide overlay' : 'Show overlay'}
            </button>
          </div>
        </header>

        <div className="workspace">
          <section className="panel countries-panel">
            <div className="panel-header">
              <div><p className="eyebrow">PARTICIPANTS</p><h2>{state.countries.length} countries</h2></div>
              <button className="icon-button" onClick={() => document.getElementById('country-name')?.focus()}>＋</button>
            </div>

            <div className="country-list">
              {state.countries.map((country) => (
                <article className="country-row" key={country.id}>
                  <div className="country-identity"><span className="flag">{country.flag}</span><div><strong>{country.name}</strong><small>{country.code}</small></div></div>
                  <label>Jury <input type="number" min="0" value={country.jury} onChange={(event) => updateCountry(country.id, { jury: Number(event.target.value), revealedJury: Number(event.target.value) })} /></label>
                  <label>Public <input type="number" min="0" value={country.televote} onChange={(event) => updateCountry(country.id, { televote: Number(event.target.value), revealedTelevote: Number(event.target.value) })} /></label>
                  <button className="delete-button" title="Remove country" onClick={() => api(`/api/countries/${country.id}`, { method: 'DELETE' })}>×</button>
                </article>
              ))}
            </div>

            <form className="add-country" onSubmit={addCountry}>
              <input id="country-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Country name" required />
              <input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Code" maxLength={3} />
              <input className="flag-input" value={flag} onChange={(event) => setFlag(event.target.value)} placeholder="🏳️" />
              <button className="button" type="submit">Add country</button>
            </form>
          </section>

          <section className="control-column">
            <div className="panel stage-panel">
              <p className="eyebrow">VOTE TYPE</p>
              <div className="segmented">
                <button className={state.phase === 'jury' ? 'active' : ''} onClick={() => api('/api/state', { method: 'PUT', body: JSON.stringify({ phase: 'jury', lastAward: null }) })}>Jury vote</button>
                <button className={state.phase === 'televote' ? 'active' : ''} onClick={() => api('/api/state', { method: 'PUT', body: JSON.stringify({ phase: 'televote', lastAward: null }) })}>Public vote</button>
              </div>
            </div>

            <div className="panel award-panel">
              <p className="eyebrow">AWARD POINTS</p>
              <div className="award-grid">
                {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((value) => (
                  <button key={value} className={points === value ? 'point active' : 'point'} onClick={() => setPoints(value)}>{value}</button>
                ))}
              </div>
              <select value={awardTo} onChange={(event) => setAwardTo(event.target.value)}>
                <option value="">Choose country</option>
                {state.countries.map((country) => <option key={country.id} value={country.id}>{country.flag} {country.name}</option>)}
              </select>
              <button className="award-button" disabled={!awardTo} onClick={award}>Award {points} points</button>
            </div>

            <div className="panel dangerous-panel">
              <button className="reset-button" onClick={() => api('/api/reset', { method: 'POST' })}>↻ Reset all results</button>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

function Overlay() {
  const state = useStateSync()
  const sorted = useMemo(() => {
    if (!state) return []
    return [...state.countries].sort((a, b) => getTotal(b, state.phase) - getTotal(a, state.phase))
  }, [state])

  if (!state) return null
  if (!state.visible) return <main className="overlay-root hidden-overlay" />

  return (
    <main className="overlay-root">
      <div className="overlay-glow" />
      <header className="overlay-header">
        <div className="overlay-brand"><span>S</span><div><strong>SMILEVISION</strong><small>{state.eventName}</small></div></div>
        <div className="phase-badge">{state.phase === 'jury' ? 'JURY VOTE' : 'PUBLIC VOTE'}</div>
      </header>

      <section className="results-board">
        <div className="board-title"><span>RANK</span><span>COUNTRY</span><span>TOTAL</span></div>
        <div className="board-list">
          {sorted.map((country, index) => {
            const total = getTotal(country, state.phase)
            const award = state.lastAward?.to === country.name
            return (
              <article className={award ? 'result-row award-row' : 'result-row'} key={country.id}>
                <div className="rank">{index + 1}</div>
                <div className="overlay-country"><span className="overlay-flag">{country.flag}</span><strong>{country.name}</strong><small>{country.code}</small></div>
                <div className="score">{total}</div>
              </article>
            )
          })}
        </div>
      </section>

      {state.lastAward && (
        <div className="award-toast" key={`${state.lastAward.to}-${state.lastAward.points}`}>
          <span className="award-copy">POINTS AWARDED TO</span>
          <strong>{state.lastAward.to}</strong>
          <b>{state.lastAward.points}</b>
        </div>
      )}
    </main>
  )
}

export default function App() {
  return window.location.pathname === '/overlay' ? <Overlay /> : <Admin />
}
