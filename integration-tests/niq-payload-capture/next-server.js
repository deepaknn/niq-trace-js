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
const { parse } = require('url')

// Simulate Next.js API route behavior
const server = http.createServer((req, res) => {
  const { pathname } = parse(req.url, true)

  if (pathname === '/api/test' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        // Store body on req for Next.js body-parsed channel
        req.body = data

        // Simulate Next.js response
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'success', received: data }))
      } catch (e) {
        res.writeHead(400)
        res.end('Bad Request')
      }
    })
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

server.listen(0, () => {
  const port = server.address().port
  process.send({ port })
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
