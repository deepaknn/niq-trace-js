'use strict'

const HttpClientPlugin = require('../../datadog-plugin-http/src/client')

class FetchPlugin extends HttpClientPlugin {
  static id = 'fetch'
  static prefix = 'tracing:apm:fetch:request'

  bindStart (ctx) {
    const req = ctx.req
    const options = new URL(req.url)
    options.headers = Object.fromEntries(req.headers.entries())

    options.method = req.method

    ctx.args = { options }

    const store = super.bindStart(ctx)

    for (const name in options.headers) {
      if (!req.headers.has(name)) {
        req.headers.set(name, options.headers[name])
      }
    }

    // Capture request body (if available and not already consumed)
    if (req.body && !req.bodyUsed) {
      try {
        const clonedRequest = req.clone()
        clonedRequest.text().then(body => {
          ctx.requestBody = body
        }).catch(() => {
          // Body already consumed or error reading
        })
      } catch (err) {
        // Clone failed or body not readable
      }
    }

    return store
  }

  error (ctx) {
    if (ctx.error.name === 'AbortError') return
    return super.error(ctx)
  }

  asyncEnd (ctx) {
    ctx.res = ctx.result

    // Capture response body (if available and not already consumed)
    if (ctx.result && !ctx.result.bodyUsed) {
      try {
        const clonedResponse = ctx.result.clone()
        clonedResponse.text().then(body => {
          ctx.responseBody = body
          this.finish(ctx)
        }).catch(() => {
          // Body already consumed or error reading
          this.finish(ctx)
        })
        return
      } catch (err) {
        // Clone failed or body not readable
      }
    }

    return this.finish(ctx)
  }
}

module.exports = FetchPlugin
