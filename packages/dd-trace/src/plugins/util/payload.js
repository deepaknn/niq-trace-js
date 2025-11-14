'use strict'

const log = require('../../log')

const PAYLOAD_MAX_STRING_LENGTH = 4096  // Default 4KB, configurable via config
const PAYLOAD_MAX_DEPTH = 20
const PAYLOAD_MAX_ELEMENTS = 256

// Sensitive keys that should be redacted
const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'pwd',
  'secret', 'token', 'api_key', 'apikey',
  'authorization', 'auth',
  'credit_card', 'creditcard', 'cc_number',
  'ssn', 'social_security', 'bearer'
])

function isSensitiveKey (key) {
  if (!key) return false
  const lowerKey = String(key).toLowerCase()

  // Check exact matches
  if (SENSITIVE_KEYS.has(lowerKey)) return true

  // Check if key contains sensitive patterns
  for (const sensitiveKey of SENSITIVE_KEYS) {
    if (lowerKey.includes(sensitiveKey)) return true
  }

  return false
}

function truncatePayload (payload, maxSize = PAYLOAD_MAX_STRING_LENGTH, depth = 0, redact = true) {
  if (depth > PAYLOAD_MAX_DEPTH) {
    return { truncated: true, value: '...' }
  }

  const payloadType = typeof payload

  switch (payloadType) {
    case 'string':
      if (payload.length > maxSize) {
        return { truncated: true, value: payload.substring(0, maxSize) }
      }
      return { truncated: false, value: payload }

    case 'number':
    case 'boolean':
    case 'undefined':
      return { truncated: false, value: payload }

    case 'object': {
      if (payload === null) {
        return { truncated: false, value: null }
      }

      // Handle Buffer
      if (Buffer.isBuffer(payload)) {
        const str = payload.toString('utf8', 0, Math.min(maxSize, payload.length))
        return { truncated: payload.length > maxSize, value: str }
      }

      // Handle objects with toJSON method
      if (typeof payload.toJSON === 'function') {
        try {
          return truncatePayload(payload.toJSON(), maxSize, depth + 1, redact)
        } catch (err) {
          log.error('Error calling toJSON during payload truncation', err)
          return { truncated: false, value: {} }
        }
      }

      // Handle arrays
      if (Array.isArray(payload)) {
        const maxArrayLength = Math.min(payload.length, PAYLOAD_MAX_ELEMENTS)
        let wasTruncated = payload.length > PAYLOAD_MAX_ELEMENTS
        const truncatedArray = new Array(maxArrayLength)

        for (let i = 0; i < maxArrayLength; i++) {
          const { value, truncated } = truncatePayload(payload[i], maxSize, depth + 1, redact)
          if (truncated) wasTruncated = true
          truncatedArray[i] = value
        }

        return { value: truncatedArray, truncated: wasTruncated }
      }

      // Handle objects
      const keys = Object.keys(payload)
      const maxKeysLength = Math.min(keys.length, PAYLOAD_MAX_ELEMENTS)
      let wasTruncated = keys.length > PAYLOAD_MAX_ELEMENTS

      const truncatedObject = {}
      for (let i = 0; i < maxKeysLength; i++) {
        const key = keys[i]

        // Redact sensitive keys
        if (redact && isSensitiveKey(key)) {
          truncatedObject[key] = '<redacted>'
          continue
        }

        const { value, truncated } = truncatePayload(payload[key], maxSize, depth + 1, redact)
        if (truncated) wasTruncated = true
        truncatedObject[key] = value
      }

      return { value: truncatedObject, truncated: wasTruncated }
    }

    default:
      return { truncated: false, value: payload }
  }
}

function shouldCapturePayload (config) {
  return config && config.payloadCapture && config.payloadCapture.enabled === true
}

function getPayloadMaxSize (config) {
  return config?.payloadCapture?.maxSize || PAYLOAD_MAX_STRING_LENGTH
}

function isTextContentType (contentType) {
  if (!contentType) return true // Default to capturing if no content-type

  const textTypes = [
    'application/json',
    'application/xml',
    'text/plain',
    'text/html',
    'text/xml',
    'application/x-www-form-urlencoded',
    'application/graphql'
  ]

  return textTypes.some(type => contentType.toLowerCase().includes(type))
}

function capturePayload (payload, config, redact = true) {
  if (!shouldCapturePayload(config)) {
    return null
  }

  if (payload === null || payload === undefined) {
    return null
  }

  const maxSize = getPayloadMaxSize(config)

  try {
    const { value, truncated } = truncatePayload(payload, maxSize, 0, redact)
    return {
      value: typeof value === 'string' ? value : JSON.stringify(value),
      truncated
    }
  } catch (err) {
    log.error('Error capturing payload', err)
    return null
  }
}

module.exports = {
  truncatePayload,
  shouldCapturePayload,
  getPayloadMaxSize,
  isTextContentType,
  capturePayload,
  PAYLOAD_MAX_STRING_LENGTH,
  PAYLOAD_MAX_DEPTH,
  PAYLOAD_MAX_ELEMENTS
}
