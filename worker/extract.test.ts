import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { EXTRACT_MODEL, EXTRACTION_SCHEMA, ExtractError, extractReceipt, type MessagesClient } from './extract'

const WEBP = new TextEncoder().encode('RIFF\x24\0\0\0WEBPVP8 fake').buffer as ArrayBuffer
const PDF = new TextEncoder().encode('%PDF-1.7\nfake').buffer as ArrayBuffer

function message(overrides: Partial<Anthropic.Message>): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: EXTRACT_MODEL,
    content: [],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    ...overrides,
  } as Anthropic.Message
}

function textMessage(text: string, stop: Anthropic.Message['stop_reason'] = 'end_turn') {
  return message({ stop_reason: stop, content: [{ type: 'text', text, citations: null }] as Anthropic.ContentBlock[] })
}

function fakeClient(result: Anthropic.Message | Error) {
  const create = vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)))
  return { client: { messages: { create } } as unknown as MessagesClient, create }
}

type CreateBody = Anthropic.MessageCreateParamsNonStreaming

describe('extractReceipt', () => {
  it('sends a WebP as an image block with the model, effort, and schema', async () => {
    const { client, create } = fakeClient(textMessage('{"date":null}'))
    await expect(extractReceipt({ bytes: WEBP, contentType: 'image/webp' }, client)).resolves.toEqual({
      date: null,
    })

    const body = (create.mock.calls[0] as unknown as [CreateBody])[0]
    expect(body.model).toBe('claude-haiku-5-5')
    expect(body.output_config).toEqual({
      effort: 'low',
      format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
    })
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('temperature')
    const [file, text] = body.messages[0].content as Anthropic.ContentBlockParam[]
    expect(file).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/webp', data: btoa('RIFF\x24\0\0\0WEBPVP8 fake') },
    })
    expect(text.type).toBe('text')
  })

  it('sends a JPEG as an image block labeled image/jpeg', async () => {
    const { client, create } = fakeClient(textMessage('{}'))
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer
    await extractReceipt({ bytes: jpeg, contentType: 'image/jpeg' }, client)
    const body = (create.mock.calls[0] as unknown as [CreateBody])[0]
    const [file] = body.messages[0].content as Anthropic.ContentBlockParam[]
    expect(file).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: btoa('\xff\xd8\xff\xe0') },
    })
  })

  it('sends a PDF as a document block', async () => {
    const { client, create } = fakeClient(textMessage('{}'))
    await extractReceipt({ bytes: PDF, contentType: 'application/pdf' }, client)
    const body = (create.mock.calls[0] as unknown as [CreateBody])[0]
    const [file] = body.messages[0].content as Anthropic.ContentBlockParam[]
    expect(file).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } })
  })

  it('skips thinking blocks and parses the text block', async () => {
    const { client } = fakeClient(
      message({
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: '{"shop":"A"}', citations: null },
        ] as Anthropic.ContentBlock[],
      }),
    )
    await expect(extractReceipt({ bytes: WEBP, contentType: 'image/webp' }, client)).resolves.toEqual({
      shop: 'A',
    })
  })

  it.each([
    ['a refusal', textMessage('{}', 'refusal')],
    ['a max_tokens stop', textMessage('{"date":', 'max_tokens')],
    ['no text block', message({ content: [] })],
    ['invalid JSON', textMessage('not json')],
    [
      'an API error',
      new Anthropic.APIError(500, { type: 'error' }, 'boom', new Headers()),
    ],
    ['a connection error', new Anthropic.APIConnectionError({ message: 'offline' })],
  ])('throws ExtractError for %s', async (_, result) => {
    const { client } = fakeClient(result)
    await expect(extractReceipt({ bytes: WEBP, contentType: 'image/webp' }, client)).rejects.toThrow(
      ExtractError,
    )
  })

  it('lets unexpected errors through', async () => {
    const { client } = fakeClient(new TypeError('bug'))
    await expect(extractReceipt({ bytes: WEBP, contentType: 'image/webp' }, client)).rejects.toThrow(
      TypeError,
    )
  })
})
