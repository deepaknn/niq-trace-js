const tracer = require('../../packages/dd-trace')

// Get config from environment
const agentPort = process.env.DD_TRACE_AGENT_PORT || process.env.AGENT_PORT || 8126
const payloadCaptureEnabled = process.env.NIQ_TRACER_PAYLOAD_CAPTURE !== 'false'
const payloadMaxSize = parseInt(process.env.NIQ_TRACER_MAX_PAYLOAD_SIZE || '4096')

tracer.init({
  flushInterval: 0,
  sampleRate: 1,
  port: agentPort,
  payloadCapture: {
    enabled: payloadCaptureEnabled,
    maxSize: payloadMaxSize
  }
})

console.log('Tracer initialized with port:', agentPort)
console.log('Payload capture enabled:', payloadCaptureEnabled)

const express = require('express')
const bodyParser = require('body-parser')

const app = express()
app.use(bodyParser.json())

app.post('/test', (req, res) => {
  res.json({ echo: req.body.message })
})

const server = app.listen(0, () => {
  const port = server.address().port
  console.log('Server listening on port:', port)
  if (process.send) {
    process.send({ port })
  }
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
