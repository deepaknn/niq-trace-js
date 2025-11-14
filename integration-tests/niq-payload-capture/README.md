# NIQ Payload Capture Integration Tests

This test suite provides comprehensive integration tests for the NIQ payload capture feature across all supported frameworks.

## Overview

The payload capture feature allows capturing request and response payloads for HTTP and gRPC frameworks, storing them as span tags for observability and debugging purposes.

## Test Coverage

### Server-Side Frameworks

1. **Express** - Tests JSON and plain text payloads, configuration options, truncation, and sensitive field redaction
2. **Fastify** - Tests request and response payload capture via existing body parser channels
3. **Connect** - Tests response payload capture via `res.end()` wrapping
4. **Restify** - Tests both `res.send()` and `res.json()` methods

### Client-Side Frameworks

(Tests for HTTP client, Fetch API, and gRPC will be added in follow-up commits)

## Configuration

### Environment Variables

- `NIQ_TRACER_PAYLOAD_CAPTURE` - Boolean to enable/disable payload capture (default: false)
- `NIQ_TRACER_MAX_PAYLOAD_SIZE` - Maximum payload size in bytes (default: 4096)

### Programmatic Configuration

```javascript
const tracer = require('dd-trace')
tracer.init({
  payloadCapture: {
    enabled: true,
    maxSize: 4096
  }
})
```

## Tag Names

- `http.request.body` - HTTP request payload
- `http.response.body` - HTTP response payload
- `http.request.body.truncated` - Set to 'true' if request was truncated
- `http.response.body.truncated` - Set to 'true' if response was truncated
- `grpc.request.body` - gRPC request message
- `grpc.response.body` - gRPC response message

## Features Tested

### Core Functionality
- ✅ JSON payload capture (request and response)
- ✅ Plain text payload capture
- ✅ Binary payload handling
- ✅ Payload truncation at configured maxSize
- ✅ Feature toggle (enabled/disabled)

### Security
- ✅ Sensitive field redaction (password, token, secret, etc.)
- ✅ Configurable size limits to prevent memory issues

### Resilience
- ✅ Application continues working if payload capture fails
- ✅ Tracing continues if payload serialization fails
- ✅ No performance impact when disabled

## Running the Tests

Run all NIQ payload capture tests:

```bash
npm test integration-tests/niq-payload-capture/
```

Run with verbose output:

```bash
DEBUG=1 npm test integration-tests/niq-payload-capture/
```

Run specific framework tests:

```bash
npm test integration-tests/niq-payload-capture/ -- --grep "Express"
npm test integration-tests/niq-payload-capture/ -- --grep "Fastify"
```

## Test Architecture

Each test follows this pattern:

1. Start a FakeAgent to capture spans
2. Spawn a test server with the framework being tested
3. Make HTTP requests to trigger tracing
4. Assert that spans contain expected payload tags
5. Verify payload content matches expectations

### Test Servers

Each framework has a dedicated test server file:

- `express-server.js` - Express server with JSON and text endpoints
- `fastify-server.js` - Fastify server with API routes
- `connect-server.js` - Connect middleware server
- `restify-server.js` - Restify server with send() and json() methods

## Implementation Notes

### Payload Capture Flow

1. **Instrumentation Layer** - Wraps framework-specific methods to capture payloads
2. **Channel Publishing** - Publishes captured payloads through diagnostic channels
3. **Plugin Layer** - Subscribes to channels and stores payloads on req/res objects
4. **Span Finalization** - Captures payloads from req/res and adds as span tags

### Memory Safety

- Uses WeakMap for context storage to prevent memory leaks
- Enforces size limits during capture (stops buffering at maxSize)
- Lazy serialization only happens at span finish time

### Performance

- Zero overhead when disabled (no hooks or wrapping)
- Minimal overhead when enabled (only captures configured amount)
- No blocking operations

## Future Enhancements

- [ ] HTTP client tests (http/https module)
- [ ] Fetch API tests
- [ ] gRPC client/server tests
- [ ] Axios tests
- [ ] Streaming payload tests
- [ ] Content-encoding tests (gzip, deflate)
- [ ] Form data tests (multipart/form-data)
