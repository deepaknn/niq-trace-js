'use strict'

const types = require('./types')
const { channel, addHook } = require('../helpers/instrument')
const shimmer = require('../../../datadog-shimmer')

const startChannel = channel('apm:grpc:server:request:start')
const asyncStartChannel = channel('apm:grpc:server:request:asyncStart')
const errorChannel = channel('apm:grpc:server:request:error')
const updateChannel = channel('apm:grpc:server:request:update')
const finishChannel = channel('apm:grpc:server:request:finish')
const emitChannel = channel('apm:grpc:server:request:emit')

// https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
const OK = 0
const CANCELLED = 1

const isValid = (server, args) => {
  return Boolean(startChannel.hasSubscribers &&
    server?.type &&
    args[0] &&
    (server.type === 'unary' ? typeof args[1] === 'function' : isEmitter(args[0])))
}

function wrapHandler (func, name) {
  return function (call, callback) {
    if (!isValid(this, arguments)) return func.apply(this, arguments)

    const metadata = call.metadata
    const type = types[this.type]
    const isStream = type !== 'unary'

    // Capture request message for payload capture
    // For unary: call.request contains the request message
    // For streaming: call is the stream itself, request comes through 'data' events
    const requestMessage = type === 'unary' ? call.request : undefined
    const ctx = { name, metadata, type, requestMessage }

    return startChannel.runStores(ctx, () => {
      try {
        const onCancel = () => {
          ctx.code = CANCELLED
          finishChannel.publish(ctx)
        }

        // Finish the span if the call was cancelled.
        call.once('cancelled', onCancel)

        if (isStream) {
          wrapStream(call, ctx, onCancel)
        } else {
          arguments[1] = wrapCallback(callback, call, ctx, onCancel)
        }

        shimmer.wrap(call, 'emit', emit => {
          return function () {
            return emitChannel.runStores(ctx, () => {
              return emit.apply(this, arguments)
            })
          }
        })

        return func.apply(this, arguments)
      } catch (e) {
        ctx.error = e
        errorChannel.publish(ctx)
      }
      // No end channel needed
    })
  }
}

function wrapRegister (register) {
  return function (name, handler, serialize, deserialize, type) {
    if (typeof handler === 'function') {
      arguments[1] = wrapHandler(handler, name)
    }

    return register.apply(this, arguments)
  }
}

function createWrapEmit (call, ctx, onCancel) {
  return function wrapEmit (emit) {
    return function (event, arg1) {
      switch (event) {
        case 'data':
          // Capture streaming request message for payload capture
          // For streaming calls, we capture the first message received
          if (!ctx.requestMessage && arg1 !== undefined) {
            ctx.requestMessage = arg1
          }
          break
        case 'error':
          ctx.error = arg1
          errorChannel.publish(ctx)
          ctx.code = arg1.code
          finishChannel.publish(ctx)
          call.removeListener('cancelled', onCancel)
          break
        // Streams are always cancelled before `finish` since 1.10.0 so we have
        // to use `prefinish` instead to avoid cancellation false positives.
        case 'prefinish':
          if (call.status) {
            updateChannel.publish(call.status)
          }
          if (!call.status || call.status.code === 0) {
            finishChannel.publish(ctx)
          }
          call.removeListener('cancelled', onCancel)
          break
      }

      return emit.apply(this, arguments)
    }
  }
}

function wrapStream (call, ctx, onCancel) {
  if (call.call && call.call.sendStatus) {
    call.call.sendStatus = wrapSendStatus(call.call.sendStatus, ctx)
  }

  // Capture streaming response messages for payload capture
  // For streaming responses, we capture the first message sent
  if (typeof call.write === 'function') {
    const originalWrite = call.write
    call.write = function (chunk) {
      if (!ctx.responseMessage && chunk !== undefined) {
        ctx.responseMessage = chunk
      }
      return originalWrite.apply(this, arguments)
    }
  }

  shimmer.wrap(call, 'emit', createWrapEmit(call, ctx, onCancel))
}

function wrapCallback (callback = () => {}, call, ctx, onCancel) {
  return shimmer.wrapFunction(callback, callback => function (err, value, trailer, flags) {
    if (err) {
      ctx.error = err
      errorChannel.publish(ctx)
    } else {
      ctx.code = OK
      ctx.trailer = trailer
      // Capture response message for payload capture
      if (value !== undefined) {
        ctx.responseMessage = value
      }
    }

    finishChannel.publish(ctx)

    call.removeListener('cancelled', onCancel)

    return asyncStartChannel.runStores(ctx, () => {
      return callback.apply(this, arguments)
      // No async end channel needed
    })
  })
}

function wrapSendStatus (sendStatus, ctx) {
  return function (status) {
    ctx.status = status
    updateChannel.publish(ctx)

    return sendStatus.apply(this, arguments)
  }
}

function isEmitter (obj) {
  return typeof obj.emit === 'function' && typeof obj.once === 'function'
}

addHook({ name: '@grpc/grpc-js', versions: ['>=1.0.3'], file: 'build/src/server.js' }, server => {
  shimmer.wrap(server.Server.prototype, 'register', wrapRegister)

  return server
})
