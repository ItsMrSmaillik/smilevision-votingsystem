import { useEffect, useState, type FormEvent, type CSSProperties } from 'react'
import { supabase } from './supabase'
import './App.css'

type Country = {
  id: string
  name: string
  code: string
  flag: string
  flagUrl: string
  videoUrl: string
  audioUrl: string
  jury: number
  televote: number
  revealedJury: number
  revealedTelevote: number
  orderIndex: number
}

type JuryVote = {
  juryCountryId: string
  recipientCountryId: string
  points: number
}

type State = {
  title: string
  eventName: string
  phase: 'jury' | 'televote'
  visible: boolean
  overlayScene: 'hidden' | 'spokesperson' | 'points12' | 'leaderboard'
  activeJuryId: string
  stepIndex: number
  countries: Country[]
  juryVotes: JuryVote[]
}

const COUNTRY_CODES: Record<string, string> = {
  albania: 'AL', armenia: 'AM', australia: 'AU', austria: 'AT', azerbaijan: 'AZ',
  belgium: 'BE', bulgaria: 'BG', croatia: 'HR', cyprus: 'CY', czechia: 'CZ',
  'czech republic': 'CZ', denmark: 'DK', estonia: 'EE', finland: 'FI', france: 'FR',
  georgia: 'GE', germany: 'DE', greece: 'GR', hungary: 'HU', iceland: 'IS',
  ireland: 'IE', israel: 'IL', italy: 'IT', latvia: 'LV', lithuania: 'LT',
  luxembourg: 'LU', malta: 'MT', moldova: 'MD', monaco: 'MC', montenegro: 'ME',
  netherlands: 'NL', 'north macedonia': 'MK', norway: 'NO', poland: 'PL',
  portugal: 'PT', romania: 'RO', russia: 'RU', sanmarino: 'SM',
  'san marino': 'SM', serbia: 'RS', slovakia: 'SK', slovenia: 'SI',
  spain: 'ES', sweden: 'SE', switzerland: 'CH', turkey: 'TR', ukraine: 'UA',
  'united kingdom': 'GB', 'united states': 'US', kosovo: 'XK',
}

function inferCountryCode(name: string) {
  const normalized = name.trim().toLowerCase()
  return COUNTRY_CODES[normalized] || name.trim().slice(0, 2).toUpperCase()
}

const COUNTRY_PALETTE: Record<string, [string, string]> = {
  AM: ['#f2a900', '#0033a0'], AT: ['#ed2939', '#ffffff'], AZ: ['#00b5e2', '#ef3340'],
  BE: ['#fdda24', '#ef3340'], BG: ['#00966e', '#d62612'], CH: ['#d52b1e', '#ffffff'],
  DE: ['#ffce00', '#dd0000'], DK: ['#c60c30', '#ffffff'], EE: ['#4891d9', '#000000'],
  ES: ['#aa151b', '#f1bf00'], FI: ['#003580', '#ffffff'], FR: ['#0055a4', '#ef4135'],
  GB: ['#012169', '#c8102e'], GE: ['#ffffff', '#e43d30'], GR: ['#0d5eaf', '#ffffff'],
  HR: ['#171796', '#ff0000'], HU: ['#436f4d', '#cd2a3e'], IE: ['#169b62', '#ff883e'],
  IL: ['#0038b8', '#ffffff'], IT: ['#009246', '#ce2b37'], LT: ['#c1272d', '#fdb913'],
  LU: ['#00a1de', '#ed2939'], LV: ['#9e3039', '#ffffff'], MC: ['#ce2b37', '#ffffff'],
  NL: ['#ae1c28', '#21468b'], NO: ['#ef2b2d', '#002868'], PL: ['#dc143c', '#ffffff'],
  PT: ['#046a38', '#da291c'], RO: ['#002b7f', '#fcd116'], RS: ['#c6363c', '#0c4076'],
  SE: ['#006aa7', '#fecc02'], UA: ['#0057b7', '#ffd700'], SM: ['#5eb6e4', '#ffffff'],
  SI: ['#0052cc', '#ed1c24'], TR: ['#e30a17', '#ffffff'], US: ['#3c3b6e', '#b22234'],
  XK: ['#244aa5', '#d4af37'],
}

function getCountryPalette(country: Country | undefined): [string, string] {
  if (!country) return ['#ffd45a', '#ff8a32']
  return COUNTRY_PALETTE[country.code.toUpperCase()] || ['#ffd45a', '#ff8a32']
}

const getTotal = (country: Country) =>
  country.revealedJury + country.revealedTelevote

const mapCountry = (row: Record<string, unknown>): Country => ({
  id: String(row.id),
  name: String(row.name),
  code: String(row.code),
  flag: String(row.flag),
  flagUrl: row.flag_url ? String(row.flag_url) : `https://flagcdn.com/w80/${String(row.code).toLowerCase()}.png`,
  videoUrl: row.video_url ? String(row.video_url) : '',
  audioUrl: row.audio_url ? String(row.audio_url) : '',
  jury: Number(row.jury),
  televote: Number(row.televote),
  revealedJury: Number(row.revealed_jury),
  revealedTelevote: Number(row.revealed_televote),
  orderIndex: Number(row.order_index ?? 0),
})

const describeError = (reason: unknown) => {
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'string') return reason
  try { return JSON.stringify(reason, null, 2) } catch { return String(reason) }
}

async function loadState(): Promise<State> {
  const [settingsResult, countriesResult] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 'main').single(),
    supabase.from('countries').select('*'),
  ])
  if (settingsResult.error) throw settingsResult.error
  if (countriesResult.error) throw countriesResult.error
  const votesResult = await supabase.from('jury_votes').select('*')
  const juryVotes = votesResult.error ? [] : votesResult.data.map((row) => ({
    juryCountryId: String(row.jury_country_id),
    recipientCountryId: String(row.recipient_country_id),
    points: Number(row.points),
  }))

  const settings = settingsResult.data
  return {
    title: settings.title,
    eventName: settings.event_name,
    phase: settings.phase,
    visible: settings.visible,
    overlayScene: settings.overlay_scene || 'hidden',
    activeJuryId: settings.active_jury_id || '',
    stepIndex: Number(settings.step_index || 0),
    countries: countriesResult.data
      .map((row) => mapCountry(row))
      .sort((a, b) => a.orderIndex - b.orderIndex),
    juryVotes,
  }
}

function useStateSync() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')

  const refresh = async () => {
    try {
      setState(await loadState())
      setError('')
    } catch (reason) {
      setError(describeError(reason))
    }
  }

  useEffect(() => {
    refresh()
    const channel = supabase.channel('smilevision-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'countries' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jury_votes' }, refresh)
      .subscribe()
    const polling = window.setInterval(refresh, 700)
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(polling)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [])
  return { state, error, refresh }
}

async function updateSettings(patch: Record<string, unknown>) {
  const { error } = await supabase.from('settings').update(patch).eq('id', 'main')
  if (error) throw error
}

async function updateCountry(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('countries').update(patch).eq('id', id)
  if (error) throw error
}

function FlagImage({ country, className = '' }: { country: Country; className?: string }) {
  return (
    <span className={`flag-image ${className}`} title={country.name}>
      <img src={country.flagUrl} alt={`${country.name} flag`} onError={(event) => {
        event.currentTarget.style.display = 'none'
        event.currentTarget.parentElement?.setAttribute('data-fallback', country.flag)
      }} />
    </span>
  )
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
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
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

function Admin() {
  const { state, error, refresh } = useStateSync()
  const [tab, setTab] = useState<'countries' | 'jury' | 'onair'>('countries')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [flag, setFlag] = useState('🏳️')
  const [selectedJuryId, setSelectedJuryId] = useState('')
  const [selectedOnAirId, setSelectedOnAirId] = useState('')

  if (error) return <main className="loading"><pre className="error-pre">Supabase setup required:\n{error}</pre></main>
  if (!state) return <main className="loading">Loading SmileVision...</main>

  const juryId = selectedJuryId || state.activeJuryId || state.countries[0]?.id || ''
  const onAirId = selectedOnAirId || state.activeJuryId || state.countries[0]?.id || ''

  const addCountry = async (event: FormEvent) => {
    event.preventDefault()
    const { error: insertError } = await supabase.from('countries').insert({
      id: crypto.randomUUID(),
      name: name.trim(),
      code: (code || name.slice(0, 2)).trim().toUpperCase(),
      flag,
      flag_url: `https://flagcdn.com/w80/${(code || name.slice(0, 2)).trim().toLowerCase()}.png`,
      order_index: state.countries.length,
    })
    if (insertError) {
      window.alert(`Could not add country: ${insertError.message}`)
      return
    }
    await refresh()
    setName('')
    setCode('')
  }

  const fillTestScores = async () => {
    await Promise.all(state.countries.map((country, index) => {
      const jury = Math.floor(Math.random() * 220)
      const televote = Math.floor(Math.random() * 220)
      return updateCountry(country.id, {
        jury,
        televote,
        revealed_jury: jury,
        revealed_televote: televote,
        order_index: index,
      })
    }))
    await refresh()
  }

  const moveCountry = async (country: Country, direction: -1 | 1) => {
    const ordered = [...state.countries].sort((a, b) => a.orderIndex - b.orderIndex)
    const index = ordered.findIndex((item) => item.id === country.id)
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= ordered.length) return
    await Promise.all([
      updateCountry(country.id, { order_index: ordered[swapIndex].orderIndex }),
      updateCountry(ordered[swapIndex].id, { order_index: country.orderIndex }),
    ])
    await refresh()
  }

  const deleteCountry = async (country: Country) => {
    if (!window.confirm(`Remove ${country.name}?`)) return
    await supabase.from('jury_votes').delete().or(
      `jury_country_id.eq.${country.id},recipient_country_id.eq.${country.id}`,
    )
    const { error: deleteError } = await supabase
      .from('countries')
      .delete()
      .eq('id', country.id)
    if (deleteError) {
      window.alert(`Could not remove ${country.name}: ${deleteError.message}`)
      return
    }
    await refresh()
  }

  const uploadMedia = async (country: Country, kind: 'video' | 'audio', file?: File) => {
    if (!file) return
    if (kind === 'video' && file.type !== 'video/mp4') {
      alert('Choose an MP4 video.')
      return
    }
    const extension = kind === 'video' ? 'mp4' : file.name.split('.').pop()?.toLowerCase() || 'mp3'
    const safeName = `${country.id}-${kind}-${Date.now()}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('spokespersons')
      .upload(safeName, file, { upsert: true })
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('spokespersons').getPublicUrl(safeName)
    await updateCountry(country.id, kind === 'video' ? { video_url: data.publicUrl } : { audio_url: data.publicUrl })
    await refresh()
  }

  const saveJuryVote = async (recipientId: string, points: number) => {
    if (recipientId === juryId) {
      window.alert('A country cannot award points to itself.')
      return
    }
    const previous = state.juryVotes.find((vote) =>
      vote.juryCountryId === juryId && vote.points === points)
    if (previous && previous.recipientCountryId === recipientId) return
    if (previous) {
      await supabase.from('jury_votes').delete()
        .eq('jury_country_id', juryId)
        .eq('points', points)
    }
    const replacement = state.juryVotes.find((vote) =>
      vote.juryCountryId === juryId && vote.recipientCountryId === recipientId)
    if (replacement && replacement.points !== points) {
      await supabase.from('jury_votes').delete()
        .eq('jury_country_id', juryId)
        .eq('recipient_country_id', recipientId)
    }
    await supabase.from('jury_votes').upsert({
      jury_country_id: juryId,
      recipient_country_id: recipientId,
      points,
    }, { onConflict: 'jury_country_id,recipient_country_id' })
    await refresh()
  }

  const randomizeJuryAwards = async (juryIds: string[]) => {
    const points = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12]
    for (const currentJuryId of juryIds) {
      const recipients = state.countries
        .filter((country) => country.id !== currentJuryId)
        .map((country) => country.id)
      for (let i = recipients.length - 1; i > 0; i--) {
        const swap = Math.floor(Math.random() * (i + 1))
        ;[recipients[i], recipients[swap]] = [recipients[swap], recipients[i]]
      }
      if (recipients.length < points.length) continue
      await supabase.from('jury_votes').delete().eq('jury_country_id', currentJuryId)
      await supabase.from('jury_votes').insert(
        points.map((pointsValue, index) => ({
          jury_country_id: currentJuryId,
          recipient_country_id: recipients[index],
          points: pointsValue,
        })),
      )
    }
    await refresh()
  }

  const setOnAirScene = async (scene: State['overlayScene'], stepIndex?: number) => {
    await updateSettings({
      visible: scene !== 'hidden',
      overlay_scene: scene,
      active_jury_id: onAirId,
      step_index: stepIndex ?? state.stepIndex,
    })
    await refresh()
  }

  const nextScene = async () => {
    const scenes: State['overlayScene'][] = ['hidden', 'spokesperson', 'points12', 'leaderboard', 'hidden']
    const current = scenes.indexOf(state.overlayScene)
    await setOnAirScene(scenes[current === -1 ? 1 : Math.min(current + 1, scenes.length - 1)])
  }

  const previousScene = async () => {
    const scenes: State['overlayScene'][] = ['hidden', 'spokesperson', 'points12', 'leaderboard']
    const current = scenes.indexOf(state.overlayScene)
    await setOnAirScene(scenes[Math.max(0, current - 1)])
  }

  const awardPoints = async () => {
    const vote = state.juryVotes.find((item) =>
      item.juryCountryId === onAirId && item.points === 12)
    if (!vote) return
    const recipient = state.countries.find((country) => country.id === vote.recipientCountryId)
    if (!recipient) return
    await updateCountry(recipient.id, {
      revealed_jury: recipient.revealedJury + 12,
      jury: recipient.jury + 12,
    })
    await refresh()
  }

  const juryVotes = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12]

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><strong>SMILE</strong>VISION</div>
        <nav>
          <button className={tab === 'countries' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('countries')}>◫ <span>Countries</span></button>
          <button className={tab === 'jury' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('jury')}>★ <span>Jury setup</span></button>
          <button className={tab === 'onair' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('onair')}>▶ <span>On air</span></button>
        </nav>
        <button className="sign-out" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </aside>

      <section className="admin-content">
        <header className="topbar">
          <div><p className="eyebrow">CONTROL ROOM</p><h1>{tab === 'countries' ? 'Countries' : tab === 'jury' ? 'Jury setup' : 'On air'}</h1></div>
          <a className="button secondary" href="/overlay" target="_blank">Open overlay ↗</a>
        </header>

        {tab === 'countries' && (
          <div className="single-panel">
            <section className="panel countries-panel">
              <div className="panel-header">
                <div><p className="eyebrow">PARTICIPANTS</p><h2>{state.countries.length} countries</h2></div>
                <button className="test-scores-button" onClick={fillTestScores}>Random test scores</button>
              </div>
              <div className="ordered-list">
                {[...state.countries].sort((a, b) => a.orderIndex - b.orderIndex).map((country, index) => (
                  <article className="ordered-row" key={country.id}>
                    <span className="order-number">{index + 1}</span>
                    <FlagImage country={country} className="admin-flag" />
                    <strong>{country.name}</strong>
                    <button onClick={() => moveCountry(country, -1)} disabled={index === 0}>↑</button>
                    <button onClick={() => moveCountry(country, 1)} disabled={index === state.countries.length - 1}>↓</button>
                    <label className="media-button">{country.videoUrl ? 'MP4 ✓' : 'MP4 +'}<input type="file" accept="video/mp4" onChange={(event) => uploadMedia(country, 'video', event.target.files?.[0])} /></label>
                    <label className="media-button">{country.audioUrl ? 'Audio ✓' : 'Audio +'}<input type="file" accept="audio/*" onChange={(event) => uploadMedia(country, 'audio', event.target.files?.[0])} /></label>
                    <button className="delete-button" title={`Remove ${country.name}`} onClick={() => deleteCountry(country)}>×</button>
                  </article>
                ))}
              </div>
              <form className="add-country" onSubmit={addCountry}>
                <input value={name} onChange={(event) => {
                  const nextName = event.target.value
                  setName(nextName)
                  setCode(inferCountryCode(nextName))
                  setFlag('🏳️')
                }} placeholder="Country name" required />
                <input className="code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Code" maxLength={3} />
                <input className="flag-input" value={flag} onChange={(event) => setFlag(event.target.value)} placeholder="🏳️" />
                <button className="button" type="submit">Add country</button>
              </form>
            </section>
          </div>
        )}

        {tab === 'jury' && (
          <div className="jury-layout">
            <aside className="jury-list panel">
              <p className="eyebrow">JURY COUNTRY</p>
              {state.countries.map((country) => (
                <button className={juryId === country.id ? 'jury-country active' : 'jury-country'} key={country.id} onClick={() => setSelectedJuryId(country.id)}>
                  <FlagImage country={country} className="jury-flag" /><strong>{country.name}</strong>
                </button>
              ))}
            </aside>
            <section className="panel jury-grid">
              <div className="panel-header">
                <div><p className="eyebrow">AWARDS</p><h2>{state.countries.find((country) => country.id === juryId)?.name || 'Select country'}</h2></div>
                <div className="jury-random-actions">
                  <button onClick={() => randomizeJuryAwards([juryId])}>Random this jury</button>
                  <button onClick={() => randomizeJuryAwards(state.countries.map((country) => country.id))}>Random all juries</button>
                </div>
              </div>
              {juryVotes.map((points) => {
                const vote = state.juryVotes.find((item) => item.juryCountryId === juryId && item.points === points)
                return (
                  <div className="jury-vote-row" key={points}>
                    <strong className={points === 12 ? 'points-12' : ''}>{points}</strong>
                    <select value={vote?.recipientCountryId || ''} onChange={(event) => saveJuryVote(event.target.value, points)}>
                      <option value="">Choose recipient</option>
                      {state.countries.map((country) => (
                        <option key={country.id} value={country.id} disabled={country.id === juryId}>
                          {country.name}{country.id === juryId ? ' — cannot receive own points' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </section>
          </div>
        )}

        {tab === 'onair' && (
          <div className="onair-layout">
            <section className="panel onair-controls">
              <p className="eyebrow">ACTIVE JURY COUNTRY</p>
              <select value={onAirId} onChange={(event) => setSelectedOnAirId(event.target.value)}>
                {state.countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
              </select>
              <div className="scene-status"><span className={state.overlayScene !== 'hidden' ? 'live-dot' : ''} /> Scene: {state.overlayScene}</div>
              <button className="previous-button" onClick={previousScene}>← Previous</button>
              <button className="next-button" onClick={nextScene}>Next →</button>
              <button className="award-button" onClick={awardPoints}>Add 12 points to score</button>
              <button className="reset-button" onClick={() => setOnAirScene('hidden')}>Hide overlay</button>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

function Overlay() {
  const { state, error } = useStateSync()

  if (error || !state || !state.visible || state.overlayScene === 'hidden') return <main className="overlay-root transparent" />

  const activeCountry = state.countries.find((country) => country.id === state.activeJuryId)
  const awards = state.juryVotes
    .filter((vote) => vote.juryCountryId === state.activeJuryId)
    .sort((a, b) => b.points - a.points)
  const points12 = awards.find((vote) => vote.points === 12)
  const points12Country = state.countries.find((country) => country.id === points12?.recipientCountryId)
  const [countryPrimary, countrySecondary] = getCountryPalette(points12Country)
  const twelveCardStyle = {
    '--card-primary': countryPrimary,
    '--card-secondary': countrySecondary,
  } as CSSProperties
  const smallAwards = awards
    .filter((vote) => vote.points < 12 && vote.recipientCountryId !== state.activeJuryId)
    .sort((a, b) => b.points - a.points)
  const sortedCountries = [...state.countries].sort((a, b) => getTotal(b) - getTotal(a))
  const leftCountries = sortedCountries.slice(0, 13)
  const rightCountries = sortedCountries.slice(13, 26)

  if (state.overlayScene === 'spokesperson') {
    return (
      <main className="overlay-root transparent">
        <section className="spokesperson-layout">
          <div className="small-awards">
            {smallAwards.map((award) => {
              const country = state.countries.find((item) => item.id === award.recipientCountryId)
              if (!country) return null
              return <div className="small-award-row" key={award.recipientCountryId}><FlagImage country={country} /><strong>{country.name}</strong><b>{award.points}</b></div>
            })}
          </div>
          <div className="spokesperson-center" />
          <div className="spokesperson-media">
            {activeCountry?.videoUrl ? (
              <video src={activeCountry.videoUrl} autoPlay />
            ) : activeCountry?.audioUrl ? (
              <div className="audio-visualizer" key={activeCountry.audioUrl}>
                <audio src={activeCountry.audioUrl} autoPlay />
                <div className="visualizer-bars">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ animationDelay: `${(index % 8) * 55}ms` }} />)}</div>
              </div>
            ) : <div className="missing-media">{activeCountry?.flag} {activeCountry?.name}</div>}
          </div>
        </section>
      </main>
    )
  }

  if (state.overlayScene === 'points12') {
    return (
      <main className="overlay-root transparent">
        {points12Country && (
          <div className="twelve-card" style={twelveCardStyle}>
            <FlagImage country={points12Country} className="twelve-flag" />
            <strong>{points12Country.name}</strong>
            <b>12</b>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="overlay-root transparent">
      <section className="leaderboard-layout">
        <div className="leaderboard-side left">
          {leftCountries.map((country, index) => (
            <div className={[
              'leaderboard-row',
              country.id === points12Country?.id ? 'moving-left' : '',
              country.id === state.activeJuryId ? 'active-jury-dim' : '',
            ].filter(Boolean).join(' ')} key={country.id}>
              <span className="leaderboard-rank">{index + 1}</span><FlagImage country={country} className="leaderboard-flag" /><strong>{country.name}</strong><b>{getTotal(country)}</b>
            </div>
          ))}
        </div>
        <div className="leaderboard-center">
          {points12Country && (
            <div className="twelve-card compact" style={twelveCardStyle}>
              <FlagImage country={points12Country} className="twelve-flag" />
              <strong>{points12Country.name}</strong>
              <b>12</b>
              <small>{activeCountry ? `from ${activeCountry.name}` : ''}</small>
            </div>
          )}
        </div>
        <div className="leaderboard-side right">
          {rightCountries.map((country, index) => (
            <div className={[
              'leaderboard-row',
              country.id === points12Country?.id ? 'moving-right' : '',
              country.id === state.activeJuryId ? 'active-jury-dim' : '',
            ].filter(Boolean).join(' ')} key={country.id}>
              <b>{getTotal(country)}</b><strong>{country.name}</strong><FlagImage country={country} className="leaderboard-flag" /><span className="leaderboard-rank">{index + 14}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])
  if (window.location.pathname === '/overlay') return <Overlay />
  return session ? <Admin /> : <AdminLogin />
}
