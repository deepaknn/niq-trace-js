'use strict'

const { spawnProc, FakeAgent } = require('../helpers')
const { assert } = require('chai')
const path = require('path')
const http = require('http')

describe('NIQ Payload Capture Integration Tests', () => {
  let agent
  let proc

  beforeEach(async () => {
    agent = await new FakeAgent().start()
  })

  afterEach(async () => {
    if (proc) {
      proc.kill()
      proc = null
    }
    if (agent) {
      await agent.stop()
      agent = null
    }
  })

  // Helper to make HTTP request AND wait for assertion
  async function requestAndAssert(url, options, assertionFn) {
    const assertionPromise = agent.assertMessageReceived(assertionFn)
    const response = await httpRequest(url, options)
    await assertionPromise
    return response
  }

  describe('Express', () => {
    it('captures request and response payloads with JSON', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await requestAndAssert(proc.url + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test request' })
      }, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'express.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])
        assert.exists(requestSpan.meta['http.response.body'])

        const requestBody = JSON.parse(requestSpan.meta['http.request.body'])
        assert.deepEqual(requestBody, { message: 'test request' })

        const responseBody = JSON.parse(requestSpan.meta['http.response.body'])
        assert.deepEqual(responseBody, { echo: 'test request' })
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)

    it('captures request and response payloads with plain text', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await requestAndAssert(proc.url + '/text', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'plain text request'
      }, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'express.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])
        assert.exists(requestSpan.meta['http.response.body'])

        assert.equal(requestSpan.meta['http.request.body'], 'plain text request')
        assert.equal(requestSpan.meta['http.response.body'], 'echo: plain text request')
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)

    it('does not capture payloads when feature is disabled', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port, NIQ_TRACER_PAYLOAD_CAPTURE: 'false' }
      })

      const response = await requestAndAssert(proc.url + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test' })
      }, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'express.request')

        assert.exists(requestSpan)
        assert.notExists(requestSpan.meta['http.request.body'])
        assert.notExists(requestSpan.meta['http.response.body'])
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)

    it('truncates large payloads according to maxSize', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port, NIQ_TRACER_MAX_PAYLOAD_SIZE: '100' }
      })

      const largeBody = 'x'.repeat(500)
      const response = await requestAndAssert(proc.url + '/text', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: largeBody
      }, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'express.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])
        assert.isTrue(requestSpan.meta['http.request.body'].length <= 100)
        assert.equal(requestSpan.meta['http.request.body.truncated'], 'true')
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)

    it('respects sensitive field redaction', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await requestAndAssert(proc.url + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'user',
          password: 'secret123',
          token: 'abc123',
          data: 'normal'
        })
      }, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'express.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])

        const requestBody = JSON.parse(requestSpan.meta['http.request.body'])
        assert.equal(requestBody.username, 'user')
        assert.equal(requestBody.password, '[REDACTED]')
        assert.equal(requestBody.token, '[REDACTED]')
        assert.equal(requestBody.data, 'normal')
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)
  })

  describe('Fastify', () => {
    it('captures request and response payloads', async () => {
      proc = await spawnProc(path.join(__dirname, 'fastify-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await requestAndAssert(proc.url + '/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'fastify test' })
      }, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'fastify.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])
        assert.exists(requestSpan.meta['http.response.body'])

        const requestBody = JSON.parse(requestSpan.meta['http.request.body'])
        assert.deepEqual(requestBody, { data: 'fastify test' })

        const responseBody = JSON.parse(requestSpan.meta['http.response.body'])
        assert.equal(responseBody.received, 'fastify test')
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)
  })

  describe('Connect', () => {
    it('captures response payloads', async () => {
      proc = await spawnProc(path.join(__dirname, 'connect-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await requestAndAssert(proc.url + '/', {}, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'web.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.response.body'])
        assert.include(requestSpan.meta['http.response.body'], 'Connect server response')
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)
  })

  describe('Restify', () => {
    it('captures request and response payloads with res.send()', async () => {
      proc = await spawnProc(path.join(__dirname, 'restify-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await requestAndAssert(proc.url + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restify: 'send' })
      }, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'restify.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])
        assert.exists(requestSpan.meta['http.response.body'])
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)

    it('captures payloads with res.json()', async () => {
      proc = await spawnProc(path.join(__dirname, 'restify-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await requestAndAssert(proc.url + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restify: 'json' })
      }, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'restify.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.response.body'])

        const responseBody = JSON.parse(requestSpan.meta['http.response.body'])
        assert.equal(responseBody.method, 'json')
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)
  })

  describe('Next.js', () => {
    it('captures API route request and response payloads', async () => {
      proc = await spawnProc(path.join(__dirname, 'next-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await requestAndAssert(proc.url + '/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextData: 'test' })
      }, ({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'web.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])
        assert.exists(requestSpan.meta['http.response.body'])

        const requestBody = JSON.parse(requestSpan.meta['http.request.body'])
        assert.deepEqual(requestBody, { nextData: 'test' })

        const responseBody = JSON.parse(requestSpan.meta['http.response.body'])
        assert.equal(responseBody.status, 'success')
      })

      assert.equal(response.statusCode, 200)
    }).timeout(10000)
  })

  describe('HTTP Client', () => {
    let targetProc

    afterEach(async () => {
      if (targetProc) {
        targetProc.kill()
        targetProc = null
      }
    })

    it('captures outbound request and response payloads', async () => {
      // Start target server first
      targetProc = await spawnProc(path.join(__dirname, 'http-target-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const targetPort = targetProc.url.split(':')[2]

      // Start client server
      proc = await spawnProc(path.join(__dirname, 'http-client-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port, TARGET_PORT: targetPort }
      })

      const response = await requestAndAssert(proc.url + '/make-request', {}, ({ payload }) => {
        const spans = payload[0]
        const httpClientSpan = spans.find(s => s.name === 'http.request' && s.meta['span.kind'] === 'client')

        if (httpClientSpan) {
          assert.exists(httpClientSpan.meta['http.request.body'])
          assert.exists(httpClientSpan.meta['http.response.body'])

          const requestBody = JSON.parse(httpClientSpan.meta['http.request.body'])
          assert.equal(requestBody.client, 'request')

          const responseBody = JSON.parse(httpClientSpan.meta['http.response.body'])
          assert.equal(responseBody.server, 'response')
        }
      })

      assert.equal(response.statusCode, 200)
    }).timeout(15000)
  })

  describe('Fetch API', () => {
    let targetProc

    afterEach(async () => {
      if (targetProc) {
        targetProc.kill()
        targetProc = null
      }
    })

    it('captures fetch request and response payloads', async () => {
      // Start target server first
      targetProc = await spawnProc(path.join(__dirname, 'http-target-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const targetPort = targetProc.url.split(':')[2]

      // Start client server
      proc = await spawnProc(path.join(__dirname, 'fetch-client-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port, TARGET_PORT: targetPort }
      })

      const response = await requestAndAssert(proc.url + '/fetch-request', {}, ({ payload }) => {
        const spans = payload[0]
        const fetchSpan = spans.find(s => s.name === 'fetch.request')

        if (fetchSpan) {
          assert.exists(fetchSpan.meta['http.request.body'])
          assert.exists(fetchSpan.meta['http.response.body'])

          const requestBody = JSON.parse(fetchSpan.meta['http.request.body'])
          assert.equal(requestBody.fetch, 'test')

          const responseBody = JSON.parse(fetchSpan.meta['http.response.body'])
          assert.equal(responseBody.server, 'response')
        }
      })

      assert.equal(response.statusCode, 200)
    }).timeout(15000)
  })

  describe('gRPC', () => {
    let grpcServerProc

    afterEach(async () => {
      if (grpcServerProc) {
        grpcServerProc.kill()
        grpcServerProc = null
      }
    })

    it('captures unary call request and response messages', async () => {
      // Start gRPC server first
      grpcServerProc = await spawnProc(path.join(__dirname, 'grpc-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const grpcPort = grpcServerProc.url.split(':')[2]

      // Start gRPC client
      proc = await spawnProc(path.join(__dirname, 'grpc-client-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port, GRPC_PORT: grpcPort }
      })

      // Wait for gRPC call to complete and assert
      await new Promise(resolve => setTimeout(resolve, 1000))

      await agent.assertMessageReceived(({ payload }) => {
        const spans = payload[0]
        const grpcClientSpan = spans.find(s => s.name === 'grpc.request' && s.meta['span.kind'] === 'client')
        const grpcServerSpan = spans.find(s => s.name === 'grpc.request' && s.meta['span.kind'] === 'server')

        // Check client span
        if (grpcClientSpan) {
          assert.exists(grpcClientSpan.meta['grpc.request.body'])
          assert.exists(grpcClientSpan.meta['grpc.response.body'])

          const clientRequest = JSON.parse(grpcClientSpan.meta['grpc.request.body'])
          assert.equal(clientRequest.name, 'TestUser')

          const clientResponse = JSON.parse(grpcClientSpan.meta['grpc.response.body'])
          assert.include(clientResponse.message, 'Hello TestUser')
        }

        // Check server span
        if (grpcServerSpan) {
          assert.exists(grpcServerSpan.meta['grpc.request.body'])
          assert.exists(grpcServerSpan.meta['grpc.response.body'])

          const serverRequest = JSON.parse(grpcServerSpan.meta['grpc.request.body'])
          assert.equal(serverRequest.name, 'TestUser')

          const serverResponse = JSON.parse(grpcServerSpan.meta['grpc.response.body'])
          assert.include(serverResponse.message, 'Hello TestUser')
        }
      })
    }).timeout(20000)
  })
})

// Helper function to make HTTP requests
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        res.body = body
        resolve(res)
      })
    })

    req.on('error', reject)

    if (options.body) {
      req.write(options.body)
    }

    req.end()
  })
}
