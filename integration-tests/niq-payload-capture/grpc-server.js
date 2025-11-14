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

const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const path = require('path')

const PROTO_PATH = path.join(__dirname, 'test.proto')

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
})

const testProto = grpc.loadPackageDefinition(packageDefinition).test

function sayHello(call, callback) {
  callback(null, {
    message: `Hello ${call.request.name}`,
    timestamp: Date.now().toString()
  })
}

const server = new grpc.Server()
server.addService(testProto.TestService.service, { sayHello })

server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('Server bind error:', err)
    process.exit(1)
  }
  server.start()
  process.send({ port })
})

process.on('SIGTERM', () => {
  server.forceShutdown()
  process.exit(0)
})
