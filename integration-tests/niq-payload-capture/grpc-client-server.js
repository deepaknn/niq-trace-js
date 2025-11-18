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

const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const path = require('path')
const http = require('http')

const PROTO_PATH = path.join(__dirname, 'test.proto')
const grpcPort = process.env.GRPC_PORT

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
})

const testProto = grpc.loadPackageDefinition(packageDefinition).test

const client = new testProto.TestService(
  `localhost:${grpcPort}`,
  grpc.credentials.createInsecure()
)

// Make a gRPC call immediately on startup
setTimeout(() => {
  client.sayHello({ name: 'TestUser' }, (error, response) => {
    if (error) {
      console.error('gRPC call error:', error)
    } else {
      console.log('gRPC response:', response)
    }
  })
}, 500)

// Simple HTTP server to keep process alive and allow test to complete
const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('gRPC client ready')
})

server.listen(0, () => {
  const port = server.address().port
  process.send({ port })
})

process.on('SIGTERM', () => {
  client.close()
  server.close(() => process.exit(0))
})
