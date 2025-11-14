const tracer = require('dd-trace')
tracer.init({
  flushInterval: 0,
  sampleRate: 1,
  port: process.env.AGENT_PORT,
  payloadCapture: {
    enabled: true,
    maxSize: 4096
  }
})

const connect = require('connect')
const http = require('http')

const app = connect()

app.use((req, res) => {
  res.end('Connect server response')
})

const server = http.createServer(app)

server.listen(0, () => {
  const port = server.address().port
  process.send({ port })
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
