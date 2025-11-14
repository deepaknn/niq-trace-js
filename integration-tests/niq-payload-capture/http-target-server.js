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

const http = require('http')

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ server: 'response', echo: body }))
    })
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
