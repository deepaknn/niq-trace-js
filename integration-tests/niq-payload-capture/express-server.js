const tracer = require('dd-trace')
tracer.init({
  flushInterval: 0,
  sampleRate: 1,
  port: process.env.AGENT_PORT,
  payloadCapture: {
    enabled: process.env.NIQ_TRACER_PAYLOAD_CAPTURE !== 'false',
    maxSize: process.env.NIQ_TRACER_MAX_PAYLOAD_SIZE
      ? parseInt(process.env.NIQ_TRACER_MAX_PAYLOAD_SIZE)
      : 4096
  }
})

const express = require('express')
const bodyParser = require('body-parser')

const app = express()

app.use(bodyParser.json())
app.use(bodyParser.text())

app.post('/json', (req, res) => {
  res.json({ echo: req.body.message })
})

app.post('/text', (req, res) => {
  res.send(`echo: ${req.body}`)
})

app.get('/health', (req, res) => {
  res.send('OK')
})

const server = app.listen(0, () => {
  const port = server.address().port
  process.send({ port })
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
