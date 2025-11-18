const tracer = require('../../packages/dd-trace')
tracer.init({
  flushInterval: 0,
  sampleRate: 1,
  port: 8126,
  payloadCapture: {
    enabled: true,
    maxSize: 4096
  }
})

const express = require('express')
const bodyParser = require('body-parser')
const http = require('http')

const app = express()
app.use(bodyParser.json())

app.post('/test', (req, res) => {
  console.log('Request body:', req.body)
  res.json({ echo: req.body.message })
})

const server = app.listen(3000, () => {
  console.log('Server started on port 3000')

  // Make a test request
  setTimeout(() => {
    const postData = JSON.stringify({ message: 'test' })
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        console.log('Response:', data)
        setTimeout(() => {
          server.close()
          process.exit(0)
        }, 2000)
      })
    })

    req.on('error', (e) => {
      console.error('Request error:', e)
    })

    req.write(postData)
    req.end()
  }, 500)
})
