import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from './supabase'
import './App.css'

function describeError(reason: unknown) {
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'string') return reason
  try {
    return JSON.stringify(reason, null, 2)
  } catch {
    return String(reason)
  }
}

function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (signInError) setError(signInError.message)
    setLoading(false)
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={signIn}>
        <div className="brand login-brand"><span className="brand-mark">S</span><strong>SMILE</strong>VISION</div>
        <p className="eyebrow">CONTROL ROOM ACCESS</p>
        <h1>Sign in</h1>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
        {error && <div className="login-error">{error}</div>}
        <button className="award-button" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Open control room'}</button>
      </form>
    </main>
  )
}

type Country = {
  id: string
  name: string
  code: string
  flag: string
  videoUrl: string
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
  spokesperson: { countryId: string; name: string; videoUrl: string; nonce: number } | null
  countries: Country[]
}

const mapCountry = (row: Record<string, unknown>): Country => ({
  id: String(row.id),
  name: String(row.name),
  code: String(row.code),
  flag: String(row.flag),
  videoUrl: row.video_url ? String(row.video_url) : '',
  jury: Number(row.jury),
  televote: Number(row.televote),
  revealedJury: Number(row.revealed_jury),
  revealedTelevote: Number(row.revealed_televote),
})

async function loadState(): Promise<State | null> {
  const [settingsResult, countriesResult] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 'main').single(),
    supabase.from('countries').select('*'),
  ])

  if (settingsResult.error) throw settingsResult.error
  if (countriesResult.error) throw countriesResult.error

  const settings = settingsResult.data
  return {
    title: settings.title,
    eventName: settings.event_name,
    phase: settings.phase,
    visible: settings.visible,
    lastAward: settings.last_award,
    spokesperson: settings.spokesperson,
    countries: countriesResult.data.map((row) => mapCountry(row)),
  }
}

function useStateSync() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const refresh = async () => {
      try {
        setState(await loadState())
        setError('')
      } catch (reason) {
        setError(describeError(reason))
      }
    }

    refresh()
    const channel = supabase
      .channel('smilevision-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'countries' }, refresh)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { state, error }
}

function getTotal(country: Country, phase: State['phase']) {
  return phase === 'jury'
    ? country.revealedJury
    : country.revealedJury + country.revealedTelevote
}

async function updateSettings(patch: Record<string, unknown>) {
  const { error } = await supabase.from('settings').update(patch).eq('id', 'main')
  if (error) throw error
}

async function updateCountry(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('countries').update(patch).eq('id', id)
  if (error) throw error
}

function Admin() {
  const { state, error } = useStateSync()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [flag, setFlag] = useState('🏳️')
  const [awardTo, setAwardTo] = useState('')
  const [points, setPoints] = useState(12)

  if (error) return (
    <main className="loading">
      <pre style={{ maxWidth: 900, whiteSpace: 'pre-wrap', padding: 24 }}>
        Supabase setup required:
        {'\n'}
        {error}
      </pre>
    </main>
  )
  if (!state) return <main className="loading">Loading SmileVision...</main>

  const addCountry = async (event: FormEvent) => {
    event.preventDefault()
    await supabase.from('countries').insert({
      id: crypto.randomUUID(),
      name: name.trim(),
      code: (code || name.slice(0, 2)).trim().toUpperCase(),
      flag,
    })
    setName('')
    setCode('')
  }

  const uploadSpokesperson = async (country: Country, file?: File) => {
    if (!file) return
    if (file.type !== 'video/mp4') {
      window.alert('Please select an MP4 video')
      return
    }
    const safeName = `${country.id}-${Date.now()}.mp4`
    const { error: uploadError } = await supabase.storage
      .from('spokespersons')
      .upload(safeName, file, { contentType: 'video/mp4', upsert: true })
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('spokespersons').getPublicUrl(safeName)
    await updateCountry(country.id, { video_url: data.publicUrl })
  }

  const playSpokesperson = async () => {
    if (!awardTo) return
    const country = state.countries.find((item) => item.id === awardTo)
    if (!country?.videoUrl) {
      window.alert('Upload an MP4 spokesperson video for this country first')
      return
    }
    await updateSettings({
      spokesperson: {
        countryId: country.id,
        name: country.name,
        videoUrl: country.videoUrl,
        nonce: Date.now(),
      },
    })
  }

  const award = async () => {
    if (!awardTo) return
    const country = state.countries.find((item) => item.id === awardTo)
    if (!country) return
    const patch = state.phase === 'jury'
      ? { jury: country.jury + points, revealed_jury: country.revealedJury + points }
      : { televote: country.televote + points, revealed_televote: country.revealedTelevote + points }
    await updateCountry(awardTo, patch)
    await updateSettings({ last_award: { from: 'Presenter', to: country.name, points } })
  }

  const reset = async () => {
    await updateSettings({ phase: 'jury', visible: true, last_award: null, spokesperson: null })
    await supabase.from('countries').update({
      jury: 0,
      televote: 0,
      revealed_jury: 0,
      revealed_televote: 0,
    }).neq('id', '')
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><strong>SMILE</strong>VISION</div>
        <nav><button className="nav-item active">◫ <span>Control room</span></button></nav>
        <div className="live-status"><span /> ONSCREEN {state.visible ? 'LIVE' : 'HIDDEN'}</div>
      </aside>

      <section className="admin-content">
        <header className="topbar">
          <div><p className="eyebrow">EVENT CONTROL</p><h1>{state.eventName}</h1></div>
          <div className="top-actions">
            <a className="button secondary" href="/overlay" target="_blank">Open overlay ↗</a>
            <button className="button secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
            <button className="button" onClick={() => updateSettings({ visible: !state.visible })}>
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
                  <label>Jury <input type="number" min="0" value={country.jury} onChange={(event) => updateCountry(country.id, { jury: Number(event.target.value), revealed_jury: Number(event.target.value) })} /></label>
                  <label>Public <input type="number" min="0" value={country.televote} onChange={(event) => updateCountry(country.id, { televote: Number(event.target.value), revealed_televote: Number(event.target.value) })} /></label>
                  <label className="video-upload" title={country.videoUrl ? 'Replace spokesperson video' : 'Upload spokesperson video'}>
                    <span>{country.videoUrl ? 'Video ✓' : 'Video +'}</span>
                    <input type="file" accept="video/mp4" onChange={(event) => uploadSpokesperson(country, event.target.files?.[0])} />
                  </label>
                  <button className="delete-button" title="Remove country" onClick={() => supabase.from('countries').delete().eq('id', country.id)}>×</button>
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
                <button className={state.phase === 'jury' ? 'active' : ''} onClick={() => updateSettings({ phase: 'jury', last_award: null })}>Jury vote</button>
                <button className={state.phase === 'televote' ? 'active' : ''} onClick={() => updateSettings({ phase: 'televote', last_award: null })}>Public vote</button>
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
              <button className="spokesperson-button" disabled={!awardTo} onClick={playSpokesperson}>▶ Play spokesperson</button>
            </div>
            <div className="panel dangerous-panel">
              <button className="reset-button" onClick={reset}>↻ Reset all results</button>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

function Overlay() {
  const { state, error } = useStateSync()
  const sorted = useMemo(() => {
    if (!state) return []
    return [...state.countries].sort((a, b) => getTotal(b, state.phase) - getTotal(a, state.phase))
  }, [state])

  if (error) return <main className="overlay-root hidden-overlay" />
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
      {state.spokesperson && (
        <div className="spokesperson-overlay" key={state.spokesperson.nonce}>
          <video
            src={state.spokesperson.videoUrl}
            autoPlay
            controls
            onEnded={() => updateSettings({ spokesperson: null })}
          />
        </div>
      )}
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (window.location.pathname === '/overlay') return <Overlay />
  return session ? <Admin /> : <AdminLogin />
}
