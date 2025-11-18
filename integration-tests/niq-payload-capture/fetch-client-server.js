const tracer = require('../../packages/dd-trace')
tracer.init({
  flushInterval: 0,
  sampleRate: 1,
  port: process.env.AGENT_PORT,
  payloadCapture: {
    enabled: true,
    maxSize: 4096
  }
})

const http = require('http')
const fetch = require('node-fetch')

const targetPort = process.env.TARGET_PORT

const server = http.createServer(async (req, res) => {
  if (req.url === '/fetch-request') {
    try {
      const response = await fetch(`http://localhost:${targetPort}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fetch: 'test' })
      })

      const data = await response.text()

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ fetchReceivedFrom: 'target', data }))
    } catch (e) {
      res.writeHead(500)
      res.end(`Error: ${e.message}`)
    }
  } else {
    res.writeHead(200)
    res.end('OK')
  }
})

server.listen(0, () => {
  const port = server.address().port
  process.send({ port })
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
