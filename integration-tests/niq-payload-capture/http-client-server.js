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

const targetPort = process.env.TARGET_PORT

const server = http.createServer((req, res) => {
  if (req.url === '/make-request') {
    const postData = JSON.stringify({ client: 'request' })

    const options = {
      hostname: 'localhost',
      port: targetPort,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const clientReq = http.request(options, (clientRes) => {
      let body = ''
      clientRes.on('data', chunk => {
        body += chunk.toString()
      })
      clientRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ clientReceivedFrom: 'target', data: body }))
      })
    })

    clientReq.on('error', (e) => {
      res.writeHead(500)
      res.end(`Error: ${e.message}`)
    })

    clientReq.write(postData)
    clientReq.end()
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
