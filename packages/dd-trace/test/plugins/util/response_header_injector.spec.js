'use strict'

const { expect } = require('chai')
const { describe, it, beforeEach } = require('tap').mocha
const id = require('../../../src/id')
const SpanContext = require('../../../src/opentracing/span_context')
const {
  injectCurrentSpanId,
  injectCurrentSpanIdIntoHeaders,
  injectCurrentSpanIdIntoGrpcMetadata,
  CURRENT_SPAN_ID_HEADER
} = require('../../../src/plugins/util/response_header_injector')

describe('Response Header Injector', () => {
  let span
  let spanContext

  beforeEach(() => {
    // Create a mock span with context
    spanContext = new SpanContext({
      traceId: id('0af7651916cd43dd8448eb211c80319c', 16),
      spanId: id('b7ad6b7169203331', 16),
      trace: { started: [], finished: [], tags: {} }
    })

    span = {
      context: () => spanContext
    }
  })

  describe('injectCurrentSpanId', () => {
    it('should inject current-span-id header with 128-bit trace ID', () => {
      let headerName, headerValue

      const setHeader = (name, value) => {
        headerName = name
        headerValue = value
      }

      const result = injectCurrentSpanId(span, setHeader)

      expect(result).to.be.true
      expect(headerName).to.equal('current-span-id')
      expect(headerValue).to.equal('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01~ncsd')
    })

    it('should inject current-span-id header with 64-bit trace ID', () => {
      spanContext = new SpanContext({
        traceId: id('00000000000000000af7651916cd43dd', 16),
        spanId: id('b7ad6b7169203331', 16),
        trace: { started: [], finished: [], tags: {} }
      })

      span = {
        context: () => spanContext
      }

      let headerName, headerValue

      const setHeader = (name, value) => {
        headerName = name
        headerValue = value
      }

      const result = injectCurrentSpanId(span, setHeader)

      expect(result).to.be.true
      expect(headerName).to.equal('current-span-id')
      expect(headerValue).to.equal('00-00000000000000000af7651916cd43dd-b7ad6b7169203331-01~ncsd')
    })

    it('should return false if span is null', () => {
      const setHeader = () => {}
      const result = injectCurrentSpanId(null, setHeader)

      expect(result).to.be.false
    })

    it('should return false if setHeader is not a function', () => {
      const result = injectCurrentSpanId(span, null)

      expect(result).to.be.false
    })

    it('should return false if span has no context', () => {
      const invalidSpan = {
        context: () => null
      }

      const setHeader = () => {}
      const result = injectCurrentSpanId(invalidSpan, setHeader)

      expect(result).to.be.false
    })

    it('should handle setHeader throwing error', () => {
      const setHeader = () => {
        throw new Error('Headers already sent')
      }

      const result = injectCurrentSpanId(span, setHeader)

      expect(result).to.be.false
    })

    it('should handle span context methods throwing errors', () => {
      const errorSpan = {
        context: () => ({
          toTraceId: () => { throw new Error('Error getting trace ID') },
          toSpanId: () => '1234'
        })
      }

      const setHeader = () => {}
      const result = injectCurrentSpanId(errorSpan, setHeader)

      expect(result).to.be.false
    })

    it('should validate trace ID format', () => {
      const invalidSpan = {
        context: () => ({
          toTraceId: () => 'invalid', // Too short
          toSpanId: () => '1234567890123456'
        })
      }

      const setHeader = () => {}
      const result = injectCurrentSpanId(invalidSpan, setHeader)

      expect(result).to.be.false
    })

    it('should validate span ID format', () => {
      const invalidSpan = {
        context: () => ({
          toTraceId: () => '0af7651916cd43dd8448eb211c80319c',
          toSpanId: () => 'short' // Wrong length
        })
      }

      const setHeader = () => {}
      const result = injectCurrentSpanId(invalidSpan, setHeader)

      expect(result).to.be.false
    })
  })

  describe('injectCurrentSpanIdIntoHeaders', () => {
    it('should inject header into HTTP headers object', () => {
      const headers = {}

      const result = injectCurrentSpanIdIntoHeaders(span, headers)

      expect(result).to.be.true
      expect(headers).to.have.property('current-span-id')
      expect(headers['current-span-id']).to.equal('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01~ncsd')
    })

    it('should return false if headers is null', () => {
      const result = injectCurrentSpanIdIntoHeaders(span, null)

      expect(result).to.be.false
    })

    it('should return false if headers is not an object', () => {
      const result = injectCurrentSpanIdIntoHeaders(span, 'not an object')

      expect(result).to.be.false
    })

    it('should not throw if headers object is frozen', () => {
      const headers = Object.freeze({})

      const result = injectCurrentSpanIdIntoHeaders(span, headers)

      // Should return false because setting property on frozen object fails
      expect(result).to.be.false
    })
  })

  describe('injectCurrentSpanIdIntoGrpcMetadata', () => {
    it('should inject header into gRPC metadata', () => {
      let metadataName, metadataValue

      const metadata = {
        set: (name, value) => {
          metadataName = name
          metadataValue = value
        }
      }

      const result = injectCurrentSpanIdIntoGrpcMetadata(span, metadata)

      expect(result).to.be.true
      expect(metadataName).to.equal('current-span-id')
      expect(metadataValue).to.equal('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01~ncsd')
    })

    it('should return false if metadata is null', () => {
      const result = injectCurrentSpanIdIntoGrpcMetadata(span, null)

      expect(result).to.be.false
    })

    it('should return false if metadata.set is not a function', () => {
      const metadata = {}

      const result = injectCurrentSpanIdIntoGrpcMetadata(span, metadata)

      expect(result).to.be.false
    })

    it('should handle metadata.set throwing error', () => {
      const metadata = {
        set: () => {
          throw new Error('Metadata already sent')
        }
      }

      const result = injectCurrentSpanIdIntoGrpcMetadata(span, metadata)

      expect(result).to.be.false
    })
  })

  describe('Header Format', () => {
    it('should use W3C traceparent format with custom suffix', () => {
      const headers = {}
      injectCurrentSpanIdIntoHeaders(span, headers)

      const headerValue = headers['current-span-id']
      const parts = headerValue.split('-')

      expect(parts).to.have.lengthOf(4)
      expect(parts[0]).to.equal('00') // Version
      expect(parts[1]).to.have.lengthOf(32) // Trace ID (128-bit)
      expect(parts[2]).to.have.lengthOf(16) // Span ID (64-bit)
      expect(parts[3]).to.equal('01~ncsd') // Flags + custom suffix
    })

    it('should use sampled flag (01)', () => {
      const headers = {}
      injectCurrentSpanIdIntoHeaders(span, headers)

      const headerValue = headers['current-span-id']
      expect(headerValue).to.include('-01~ncsd')
    })

    it('should include custom suffix ~ncsd', () => {
      const headers = {}
      injectCurrentSpanIdIntoHeaders(span, headers)

      const headerValue = headers['current-span-id']
      expect(headerValue).to.match(/~ncsd$/)
    })
  })

  describe('Error Handling', () => {
    it('should never throw errors on invalid inputs', () => {
      expect(() => injectCurrentSpanId(null, null)).to.not.throw()
      expect(() => injectCurrentSpanId(undefined, undefined)).to.not.throw()
      expect(() => injectCurrentSpanId({}, {})).to.not.throw()
      expect(() => injectCurrentSpanIdIntoHeaders(null, null)).to.not.throw()
      expect(() => injectCurrentSpanIdIntoGrpcMetadata(null, null)).to.not.throw()
    })

    it('should handle unexpected errors gracefully', () => {
      const errorSpan = {
        context: () => {
          throw new Error('Unexpected error')
        }
      }

      const setHeader = () => {}
      const result = injectCurrentSpanId(errorSpan, setHeader)

      expect(result).to.be.false
    })
  })
})
