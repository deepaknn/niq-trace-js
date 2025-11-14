'use strict'

const RouterPlugin = require('../../datadog-plugin-router/src')
const { storage } = require('../../datadog-core')

class FastifyTracingPlugin extends RouterPlugin {
  static id = 'fastify'

  constructor (...args) {
    super(...args)

    this.addSub('apm:fastify:request:handle', ({ req }) => {
      this.setFramework(req, 'fastify', this.config)
    })

    this.addBind('datadog:fastify:pre-parsing:start', getParentStore)
    this.addBind('datadog:fastify:pre-validation:start', getParentStore)

    this.addSub('datadog:fastify:pre-parsing:finish', (ctx) => {
      return ctx.parentStore
    })
    this.addSub('datadog:fastify:pre-validation:finish', (ctx) => {
      return ctx.parentStore
    })
    this.addSub('datadog:fastify:callback:execute', getParentStore)

    // Subscribe to body parser for request payload capture
    this.addSub('datadog:fastify:body-parser:finish', ({ req, body }) => {
      if (req && body !== undefined && body !== null) {
        req.body = body
      }
    })

    // Subscribe to response payload channel for response payload capture
    this.addSub('datadog:fastify:response:finish', ({ res, body }) => {
      if (res && body !== undefined && body !== null) {
        res._payloadBody = body
      }
    })
  }
}

function getParentStore (ctx) {
  ctx.parentStore = ctx.parentStore ?? storage('legacy').getStore()
  return ctx.parentStore
}

module.exports = FastifyTracingPlugin
