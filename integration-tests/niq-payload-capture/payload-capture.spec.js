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

  describe('Express', () => {
    it('captures request and response payloads with JSON', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await httpRequest(proc.url + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test request' })
      })

      assert.equal(response.statusCode, 200)

      await agent.assertMessageReceived(({ payload }) => {
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
    }).timeout(10000)

    it('captures request and response payloads with plain text', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await httpRequest(proc.url + '/text', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'plain text request'
      })

      assert.equal(response.statusCode, 200)

      await agent.assertMessageReceived(({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'express.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])
        assert.exists(requestSpan.meta['http.response.body'])

        assert.equal(requestSpan.meta['http.request.body'], 'plain text request')
        assert.equal(requestSpan.meta['http.response.body'], 'echo: plain text request')
      })
    }).timeout(10000)

    it('does not capture payloads when feature is disabled', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port, NIQ_TRACER_PAYLOAD_CAPTURE: 'false' }
      })

      const response = await httpRequest(proc.url + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test' })
      })

      assert.equal(response.statusCode, 200)

      await agent.assertMessageReceived(({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'express.request')

        assert.exists(requestSpan)
        assert.notExists(requestSpan.meta['http.request.body'])
        assert.notExists(requestSpan.meta['http.response.body'])
      })
    }).timeout(10000)

    it('truncates large payloads according to maxSize', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port, NIQ_TRACER_MAX_PAYLOAD_SIZE: '100' }
      })

      const largeBody = 'x'.repeat(500)
      const response = await httpRequest(proc.url + '/text', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: largeBody
      })

      assert.equal(response.statusCode, 200)

      await agent.assertMessageReceived(({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'express.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])
        assert.isTrue(requestSpan.meta['http.request.body'].length <= 100)
        assert.equal(requestSpan.meta['http.request.body.truncated'], 'true')
      })
    }).timeout(10000)

    it('respects sensitive field redaction', async () => {
      proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await httpRequest(proc.url + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'user',
          password: 'secret123',
          token: 'abc123',
          data: 'normal'
        })
      })

      assert.equal(response.statusCode, 200)

      await agent.assertMessageReceived(({ payload }) => {
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
    }).timeout(10000)
  })

  describe('Fastify', () => {
    it('captures request and response payloads', async () => {
      proc = await spawnProc(path.join(__dirname, 'fastify-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await httpRequest(proc.url + '/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'fastify test' })
      })

      assert.equal(response.statusCode, 200)

      await agent.assertMessageReceived(({ payload }) => {
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
    }).timeout(10000)
  })

  describe('Connect', () => {
    it('captures response payloads', async () => {
      proc = await spawnProc(path.join(__dirname, 'connect-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await httpRequest(proc.url + '/')
      assert.equal(response.statusCode, 200)

      await agent.assertMessageReceived(({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'web.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.response.body'])
        assert.include(requestSpan.meta['http.response.body'], 'Connect server response')
      })
    }).timeout(10000)
  })

  describe('Restify', () => {
    it('captures request and response payloads with res.send()', async () => {
      proc = await spawnProc(path.join(__dirname, 'restify-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await httpRequest(proc.url + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restify: 'send' })
      })

      assert.equal(response.statusCode, 200)

      await agent.assertMessageReceived(({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'restify.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.request.body'])
        assert.exists(requestSpan.meta['http.response.body'])
      })
    }).timeout(10000)

    it('captures payloads with res.json()', async () => {
      proc = await spawnProc(path.join(__dirname, 'restify-server.js'), {
        env: { ...process.env, AGENT_PORT: agent.port }
      })

      const response = await httpRequest(proc.url + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restify: 'json' })
      })

      assert.equal(response.statusCode, 200)

      await agent.assertMessageReceived(({ payload }) => {
        const spans = payload[0]
        const requestSpan = spans.find(s => s.name === 'restify.request')

        assert.exists(requestSpan)
        assert.exists(requestSpan.meta['http.response.body'])

        const responseBody = JSON.parse(requestSpan.meta['http.response.body'])
        assert.equal(responseBody.method, 'json')
      })
    }).timeout(10000)
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
