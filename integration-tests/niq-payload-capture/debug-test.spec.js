'use strict'

const { spawnProc, FakeAgent } = require('../helpers')
const { assert } = require('chai')
const path = require('path')
const http = require('http')

describe('Debug Test', () => {
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

  it('receives any trace at all', async () => {
    proc = await spawnProc(path.join(__dirname, 'express-server.js'), {
      env: { ...process.env, AGENT_PORT: agent.port }
    })

    const assertionPromise = agent.assertMessageReceived(({ payload }) => {
      console.log('Received payload:', JSON.stringify(payload, null, 2))
      assert.isArray(payload)
    })

    // Make request
    await new Promise((resolve, reject) => {
      const req = http.request(proc.url + '/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => resolve())
      })
      req.on('error', reject)
      req.write(JSON.stringify({ message: 'test' }))
      req.end()
    })

    await assertionPromise
  }).timeout(15000)
})
