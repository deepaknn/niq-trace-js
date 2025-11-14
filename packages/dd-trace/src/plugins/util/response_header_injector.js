'use strict'

const log = require('../../log')

/**
 * Injects the current-span-id header into server responses.
 *
 * This header contains the current server span's trace and span IDs in W3C traceparent format
 * with a custom suffix: 00-{traceId}-{spanId}-01~ncsd
 *
 * Format:
 * - version: 00 (W3C version)
 * - trace-id: 32 hex characters (128-bit)
 * - span-id: 16 hex characters (64-bit)
 * - flags: 01 (sampled)
 * - suffix: ~ncsd (custom identifier)
 *
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01~ncsd
 *
 * IMPORTANT: This function must NEVER throw errors that could break the application.
 * All errors are caught and logged at WARN level only.
 */

const CURRENT_SPAN_ID_HEADER = 'current-span-id'

/**
 * Safely injects the current-span-id header for a given span
 *
 * @param {Object} span - The active server span
 * @param {Function} setHeader - Function to set the header (headers object or setter function)
 * @returns {boolean} - True if injection succeeded, false otherwise
 */
function injectCurrentSpanId (span, setHeader) {
  try {
    // Validate inputs
    if (!span || typeof setHeader !== 'function') {
      log.warn('[NIQ] Invalid parameters for current-span-id injection')
      return false
    }

    // Get span context
    const spanContext = span.context()
    if (!spanContext) {
      log.warn('[NIQ] No span context available for current-span-id injection')
      return false
    }

    // Get trace ID in hex format (32 chars for 128-bit, padded)
    let traceIdHex
    try {
      traceIdHex = spanContext.toTraceId(true) // Get hex format
      if (!traceIdHex || traceIdHex.length < 16) {
        log.warn('[NIQ] Invalid trace ID for current-span-id injection')
        return false
      }
    } catch (err) {
      log.warn('[NIQ] Error getting trace ID for current-span-id injection:', err.message)
      return false
    }

    // Get span ID in hex format (16 chars, zero-padded)
    let spanIdHex
    try {
      spanIdHex = spanContext.toSpanId(true) // Get hex format
      if (!spanIdHex || spanIdHex.length !== 16) {
        log.warn('[NIQ] Invalid span ID for current-span-id injection')
        return false
      }
    } catch (err) {
      log.warn('[NIQ] Error getting span ID for current-span-id injection:', err.message)
      return false
    }

    // Build W3C traceparent format with custom suffix: 00-{traceId}-{spanId}-01~ncsd
    const currentSpanIdValue = `00-${traceIdHex}-${spanIdHex}-01~ncsd`

    // Inject the header
    try {
      setHeader(CURRENT_SPAN_ID_HEADER, currentSpanIdValue)
      log.debug(`[NIQ] Successfully injected current-span-id header: ${currentSpanIdValue}`)
      return true
    } catch (err) {
      // This can happen if response is already committed or headers already sent
      log.warn('[NIQ] Error setting current-span-id header:', err.message)
      return false
    }
  } catch (err) {
    // Catch-all for any unexpected errors
    log.warn('[NIQ] Unexpected error in current-span-id injection:', err.message)
    return false
  }
}

/**
 * Injects current-span-id header into HTTP response headers object
 *
 * @param {Object} span - The active server span
 * @param {Object} headers - The HTTP headers object to modify
 * @returns {boolean} - True if injection succeeded, false otherwise
 */
function injectCurrentSpanIdIntoHeaders (span, headers) {
  if (!headers || typeof headers !== 'object') {
    log.warn('[NIQ] Invalid headers object for current-span-id injection')
    return false
  }

  return injectCurrentSpanId(span, (name, value) => {
    headers[name] = value
  })
}

/**
 * Injects current-span-id header into gRPC metadata/trailer
 *
 * @param {Object} span - The active server span
 * @param {Object} metadata - The gRPC Metadata object
 * @returns {boolean} - True if injection succeeded, false otherwise
 */
function injectCurrentSpanIdIntoGrpcMetadata (span, metadata) {
  if (!metadata || typeof metadata.set !== 'function') {
    log.warn('[NIQ] Invalid gRPC metadata object for current-span-id injection')
    return false
  }

  return injectCurrentSpanId(span, (name, value) => {
    metadata.set(name, value)
  })
}

module.exports = {
  injectCurrentSpanId,
  injectCurrentSpanIdIntoHeaders,
  injectCurrentSpanIdIntoGrpcMetadata,
  CURRENT_SPAN_ID_HEADER
}
