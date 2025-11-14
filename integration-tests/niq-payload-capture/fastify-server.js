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

const fastify = require('fastify')

const app = fastify()

app.post('/api/test', async (request, reply) => {
  const data = request.body
  return { received: data.data, status: 'ok' }
})

app.get('/health', async (request, reply) => {
  return { status: 'healthy' }
})

app.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
  if (err) {
    process.exit(1)
  }
  const port = new URL(address).port
  process.send({ port: parseInt(port) })
})

process.on('SIGTERM', () => {
  app.close().then(() => process.exit(0))
})
