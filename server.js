import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const app = express()
const PORT = process.env.PORT || 3001
const DATA_FILE = path.join(process.cwd(), 'data.json')

app.use(express.json())

const defaultState = {
  title: 'SMILEVISION',
  eventName: 'Grand Final',
  phase: 'jury',
  visible: true,
  lastAward: null,
  countries: [
    { id: 'smile', name: 'SmileLand', code: 'SM', flag: '🌞', jury: 0, televote: 0, revealedJury: 0, revealedTelevote: 0 },
    { id: 'sweden', name: 'Sweden', code: 'SE', flag: '🇸🇪', jury: 0, televote: 0, revealedJury: 0, revealedTelevote: 0 },
    { id: 'ukraine', name: 'Ukraine', code: 'UA', flag: '🇺🇦', jury: 0, televote: 0, revealedJury: 0, revealedTelevote: 0 },
  ],
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return structuredClone(defaultState)
  }
}

function writeState(state) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2))
}

let state = readState()
const clients = new Set()

function broadcast() {
  const payload = `data: ${JSON.stringify(state)}\n\n`
  clients.forEach((client) => client.write(payload))
}

app.get('/api/state', (_req, res) => res.json(state))

app.put('/api/state', (req, res) => {
  state = { ...state, ...req.body }
  writeState(state)
  broadcast()
  res.json(state)
})

app.post('/api/countries', (req, res) => {
  const { name, code, flag } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  const country = {
    id: randomUUID(),
    name: name.trim(),
    code: (code || name.slice(0, 2)).trim().toUpperCase(),
    flag: flag || '🏳️',
    jury: 0,
    televote: 0,
    revealedJury: 0,
    revealedTelevote: 0,
  }
  state = { ...state, countries: [...state.countries, country] }
  writeState(state)
  broadcast()
  res.status(201).json(country)
})

app.put('/api/countries/:id', (req, res) => {
  const country = state.countries.find((item) => item.id === req.params.id)
  if (!country) return res.status(404).json({ error: 'Country not found' })
  Object.assign(country, req.body)
  writeState(state)
  broadcast()
  res.json(country)
})

app.delete('/api/countries/:id', (req, res) => {
  state = { ...state, countries: state.countries.filter((item) => item.id !== req.params.id) }
  writeState(state)
  broadcast()
  res.status(204).end()
})

app.post('/api/reset', (_req, res) => {
  state = structuredClone(defaultState)
  writeState(state)
  broadcast()
  res.json(state)
})

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  res.write(`data: ${JSON.stringify(state)}\n\n`)
  clients.add(res)
  req.on('close', () => clients.delete(res))
})

app.listen(PORT, () => {
  console.log(`SmileVision server listening on http://localhost:${PORT}`)
})
