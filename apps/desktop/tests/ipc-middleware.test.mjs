import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeRenderer, withIpcMiddleware } from '../dist/ipc/middleware.js'

test('middleware wraps the handler in order and preserves arguments and async results', async () => {
  const calls = []
  const event = {}

  const middleware = (name) => async (received, next) => {
    assert.equal(received, event)
    calls.push(`${name}:before`)

    const result = await next()

    calls.push(`${name}:after`)

    return result
  }

  const handler = withIpcMiddleware(
    async (received, value) => {
      assert.equal(received, event)
      calls.push('handler')

      return value * 2
    },
    middleware('first'),
    middleware('second'),
  )

  assert.equal(await handler(event, 3), 6)

  assert.deepEqual(calls, [
    'first:before',
    'second:before',
    'handler',
    'second:after',
    'first:after',
  ])
})

test('authorization rejects other windows and subframes before calling the handler', async () => {
  const renderer = { mainFrame: {} }
  let calls = 0
  const handler = withIpcMiddleware(() => ++calls, authorizeRenderer(renderer))

  await assert.rejects(
    handler({ sender: {}, senderFrame: renderer.mainFrame }),
    /Unauthorized IPC/,
  )

  await assert.rejects(
    handler({ sender: renderer, senderFrame: {} }),
    /Unauthorized IPC/,
  )

  assert.equal(calls, 0)

  assert.equal(
    await handler({ sender: renderer, senderFrame: renderer.mainFrame }),
    1,
  )
})

test('handler errors propagate and middleware cannot invoke the handler twice', async () => {
  const error = new Error('service failed')

  await assert.rejects(
    withIpcMiddleware(
      async () => {
        throw error
      },
      (_event, next) => next(),
    )({}),
    (received) => received === error,
  )

  let calls = 0

  const handler = withIpcMiddleware(
    () => ++calls,
    async (_event, next) => {
      await next()

      return next()
    },
  )

  await assert.rejects(handler({}), /next\(\) called more than once/)
  assert.equal(calls, 1)
})
