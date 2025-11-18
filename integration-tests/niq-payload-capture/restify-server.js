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

const restify = require('restify')

const server = restify.createServer()

server.use(restify.plugins.bodyParser())

server.post('/send', (req, res, next) => {
  res.send(200, { method: 'send', received: req.body })
  next()
})

server.post('/json', (req, res, next) => {
  res.json({ method: 'json', received: req.body })
  next()
})

server.get('/health', (req, res, next) => {
  res.send('OK')
  next()
})

server.listen(0, () => {
  const port = server.address().port
  process.send({ port })
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
