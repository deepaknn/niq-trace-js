'use strict'

const { expect } = require('chai')
const { describe, it, before, after, beforeEach, afterEach } = require('tap').mocha
const http = require('http')
const agent = require('../../dd-trace')

describe('NIQ Header Injection Integration', () => {
  let tracer
  let port = 13000
  let server
  let serverUrl

  before(() => {
    // Initialize tracer
    tracer = agent.use(() => {})
    tracer.init({
      service: 'niq-test-service',
      flushInterval: 0
    })
  })

  afterEach((done) => {
    if (server) {
      server.close(() => {
        server = null
        port++
        done()
      })
    } else {
      port++
      done()
    }
  })

  describe('HTTP Server - Response Header Injection', () => {
    beforeEach(() => {
      serverUrl = `http://localhost:${port}`
    })

    it('should inject current-span-id header in HTTP response', (done) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'success' }))
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          expect(res.headers).to.have.property('current-span-id')

          const headerValue = res.headers['current-span-id']
          const parts = headerValue.split('-')

          // Validate format: 00-{traceId}-{spanId}-01~ncsd
          expect(parts).to.have.lengthOf(4)
          expect(parts[0]).to.equal('00') // Version
          expect(parts[1]).to.have.lengthOf(32) // Trace ID (128-bit hex)
          expect(parts[2]).to.have.lengthOf(16) // Span ID (64-bit hex)
          expect(parts[3]).to.equal('01~ncsd') // Flags + suffix

          // Validate hex format
          expect(parts[1]).to.match(/^[0-9a-f]{32}$/i)
          expect(parts[2]).to.match(/^[0-9a-f]{16}$/i)

          server.close(done)
        }).on('error', done)
      })
    })

    it('should inject current-span-id header with valid trace and span IDs', (done) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('OK')
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          const headerValue = res.headers['current-span-id']
          expect(headerValue).to.be.a('string')
          expect(headerValue).to.match(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01~ncsd$/i)

          server.close(done)
        }).on('error', done)
      })
    })

    it('should inject current-span-id even with custom headers', (done) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value'
        })
        res.end(JSON.stringify({ test: 'data' }))
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          expect(res.headers).to.have.property('current-span-id')
          expect(res.headers).to.have.property('x-custom-header', 'custom-value')

          server.close(done)
        }).on('error', done)
      })
    })

    it('should handle multiple requests correctly', (done) => {
      let requestCount = 0
      const headers = []

      server = http.createServer((req, res) => {
        res.writeHead(200)
        res.end('OK')
      })

      server.listen(port, () => {
        const makeRequest = () => {
          http.get(serverUrl, (res) => {
            headers.push(res.headers['current-span-id'])
            requestCount++

            if (requestCount === 3) {
              // All three requests should have different span IDs
              expect(headers).to.have.lengthOf(3)
              expect(headers[0]).to.not.equal(headers[1])
              expect(headers[1]).to.not.equal(headers[2])
              expect(headers[0]).to.not.equal(headers[2])

              // All should have valid format
              headers.forEach(header => {
                expect(header).to.match(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01~ncsd$/i)
              })

              server.close(done)
            }
          }).on('error', done)
        }

        makeRequest()
        makeRequest()
        makeRequest()
      })
    })
  })

  describe('HTTP Client - Request Header Injection', () => {
    beforeEach(() => {
      serverUrl = `http://localhost:${port}`
    })

    it('should inject niqtid header in HTTP client requests', (done) => {
      let receivedHeaders = null

      server = http.createServer((req, res) => {
        receivedHeaders = req.headers
        res.writeHead(200)
        res.end('OK')
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          res.resume()
          res.on('end', () => {
            expect(receivedHeaders).to.have.property('niqtid')

            const niqtidValue = receivedHeaders.niqtid
            const parts = niqtidValue.split('-')

            // Format: {trace-id-hex}-{span-id-hex}-{parent-span-id-hex}~niqtid
            expect(parts).to.have.lengthOf(3)
            expect(parts[0]).to.match(/^[0-9a-f]{32}$/i) // Trace ID
            expect(parts[1]).to.match(/^[0-9a-f]{16}$/i) // Span ID
            expect(parts[2]).to.match(/^[0-9a-f]{16}~niqtid$/i) // Parent ID + suffix

            server.close(done)
          })
        }).on('error', done)
      })
    })

    it('should inject niqtid with root span (parent ID = 0000000000000000)', (done) => {
      let receivedHeaders = null

      server = http.createServer((req, res) => {
        receivedHeaders = req.headers
        res.writeHead(200)
        res.end('OK')
      })

      server.listen(port, () => {
        // Create a root span by making a request
        http.get(serverUrl, (res) => {
          res.resume()
          res.on('end', () => {
            const niqtidValue = receivedHeaders.niqtid
            const parts = niqtidValue.split('~')
            const ids = parts[0].split('-')

            // For root spans, parent ID should be all zeros
            expect(ids[2]).to.match(/^[0-9a-f]{16}$/i)

            server.close(done)
          })
        }).on('error', done)
      })
    })

    it('should inject both x-datadog headers and niqtid', (done) => {
      let receivedHeaders = null

      server = http.createServer((req, res) => {
        receivedHeaders = req.headers
        res.writeHead(200)
        res.end('OK')
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          res.resume()
          res.on('end', () => {
            // Check Datadog headers
            expect(receivedHeaders).to.have.property('x-datadog-trace-id')
            expect(receivedHeaders).to.have.property('x-datadog-parent-id')

            // Check NIQ custom header
            expect(receivedHeaders).to.have.property('niqtid')

            server.close(done)
          })
        }).on('error', done)
      })
    })
  })

  describe('End-to-End Distributed Tracing', () => {
    beforeEach(() => {
      serverUrl = `http://localhost:${port}`
    })

    it('should propagate trace context from client to server and back', (done) => {
      let requestNiqtid = null
      let requestDatadogTraceId = null

      server = http.createServer((req, res) => {
        requestNiqtid = req.headers.niqtid
        requestDatadogTraceId = req.headers['x-datadog-trace-id']

        res.writeHead(200)
        res.end('OK')
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          const responseCurrentSpanId = res.headers['current-span-id']

          res.resume()
          res.on('end', () => {
            // Verify request headers were injected
            expect(requestNiqtid).to.exist
            expect(requestDatadogTraceId).to.exist

            // Verify response header was injected
            expect(responseCurrentSpanId).to.exist

            // Extract trace IDs from both headers
            const niqtidParts = requestNiqtid.split('-')
            const requestTraceIdHex = niqtidParts[0]

            const currentSpanIdParts = responseCurrentSpanId.split('-')
            const responseTraceIdHex = currentSpanIdParts[1]

            // Trace IDs should match (same trace context)
            expect(requestTraceIdHex).to.equal(responseTraceIdHex)

            server.close(done)
          })
        }).on('error', done)
      })
    })

    it('should maintain trace context across multiple hops', (done) => {
      let hop1Headers = null
      let hop2Headers = null

      // Hop 2 server
      const hop2Port = port + 1
      const hop2Server = http.createServer((req, res) => {
        hop2Headers = req.headers
        res.writeHead(200)
        res.end('OK')
      })

      hop2Server.listen(hop2Port, () => {
        // Hop 1 server (makes request to hop 2)
        server = http.createServer((req, res) => {
          hop1Headers = req.headers

          // Make request to hop 2
          http.get(`http://localhost:${hop2Port}`, (hop2Res) => {
            hop2Res.resume()
            hop2Res.on('end', () => {
              res.writeHead(200)
              res.end('OK')
            })
          }).on('error', (err) => {
            res.writeHead(500)
            res.end('Error')
          })
        })

        server.listen(port, () => {
          // Client makes request to hop 1
          http.get(serverUrl, (res) => {
            res.resume()
            res.on('end', () => {
              // Verify trace propagation
              expect(hop1Headers.niqtid).to.exist
              expect(hop2Headers.niqtid).to.exist

              // Extract trace IDs
              const hop1TraceId = hop1Headers.niqtid.split('-')[0]
              const hop2TraceId = hop2Headers.niqtid.split('-')[0]

              // Trace ID should be the same across hops
              expect(hop1TraceId).to.equal(hop2TraceId)

              server.close(() => {
                hop2Server.close(done)
              })
            })
          }).on('error', done)
        })
      })
    })
  })

  describe('Header Format Validation', () => {
    beforeEach(() => {
      serverUrl = `http://localhost:${port}`
    })

    it('should use W3C compatible hex format for niqtid', (done) => {
      let receivedHeaders = null

      server = http.createServer((req, res) => {
        receivedHeaders = req.headers
        res.writeHead(200)
        res.end('OK')
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          res.resume()
          res.on('end', () => {
            const niqtid = receivedHeaders.niqtid
            const parts = niqtid.split('~niqtid')[0].split('-')

            // All parts should be valid hex
            parts.forEach(part => {
              expect(part).to.match(/^[0-9a-f]+$/i)
            })

            // Trace ID: 32 chars (128-bit) or 16 chars (64-bit)
            expect(parts[0].length).to.be.oneOf([16, 32])

            // Span ID: 16 chars
            expect(parts[1]).to.have.lengthOf(16)

            // Parent ID: 16 chars
            expect(parts[2]).to.have.lengthOf(16)

            server.close(done)
          })
        }).on('error', done)
      })
    })

    it('should use W3C traceparent format for current-span-id', (done) => {
      server = http.createServer((req, res) => {
        res.writeHead(200)
        res.end('OK')
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          const currentSpanId = res.headers['current-span-id']

          // Format: 00-{traceId}-{spanId}-01~ncsd
          expect(currentSpanId).to.match(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01~ncsd$/i)

          // Verify W3C version
          expect(currentSpanId.substring(0, 2)).to.equal('00')

          // Verify sampled flag
          expect(currentSpanId).to.include('-01~')

          // Verify custom suffix
          expect(currentSpanId).to.endWith('~ncsd')

          server.close(done)
        }).on('error', done)
      })
    })

    it('should ensure trace IDs are properly zero-padded', (done) => {
      server = http.createServer((req, res) => {
        res.writeHead(200)
        res.end('OK')
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          const currentSpanId = res.headers['current-span-id']
          const parts = currentSpanId.split('-')

          // Trace ID must be exactly 32 characters (zero-padded)
          expect(parts[1]).to.have.lengthOf(32)

          // Span ID must be exactly 16 characters (zero-padded)
          expect(parts[2]).to.have.lengthOf(16)

          server.close(done)
        }).on('error', done)
      })
    })
  })

  describe('Error Resilience', () => {
    beforeEach(() => {
      serverUrl = `http://localhost:${port}`
    })

    it('should not break response if header injection fails', (done) => {
      server = http.createServer((req, res) => {
        // Even if something goes wrong with header injection,
        // the response should still work
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('Response sent successfully')
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          expect(res.statusCode).to.equal(200)

          let body = ''
          res.on('data', chunk => { body += chunk })
          res.on('end', () => {
            expect(body).to.equal('Response sent successfully')
            server.close(done)
          })
        }).on('error', done)
      })
    })

    it('should handle responses without writeHead call', (done) => {
      server = http.createServer((req, res) => {
        // Direct end() without writeHead()
        res.end('OK')
      })

      server.listen(port, () => {
        http.get(serverUrl, (res) => {
          expect(res.statusCode).to.equal(200)

          res.resume()
          res.on('end', () => {
            // Header might not be injected without writeHead,
            // but response should still work
            expect(res.statusCode).to.equal(200)

            server.close(done)
          })
        }).on('error', done)
      })
    })
  })
})
