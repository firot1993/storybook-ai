import { describe, it, expect } from 'vitest'
import { encodeStoryAudioPayload, decodeStoryAudioPayload } from '../story-audio'

describe('encodeStoryAudioPayload', () => {
  it('returns plain audioUrl when no scene audio urls', () => {
    const result = encodeStoryAudioPayload({ audioUrl: 'http://example.com/audio.wav' })
    expect(result).toBe('http://example.com/audio.wav')
  })

  it('returns plain audioUrl when sceneAudioUrls is empty array', () => {
    const result = encodeStoryAudioPayload({ audioUrl: 'http://example.com/a.wav', sceneAudioUrls: [] })
    expect(result).toBe('http://example.com/a.wav')
  })

  it('returns empty string when both are missing', () => {
    const result = encodeStoryAudioPayload({})
    expect(result).toBe('')
  })

  it('encodes as json: prefixed base64 when sceneAudioUrls are present', () => {
    const payload = {
      audioUrl: 'http://example.com/full.wav',
      sceneAudioUrls: ['http://example.com/s1.wav', 'http://example.com/s2.wav'],
    }
    const encoded = encodeStoryAudioPayload(payload)
    expect(encoded.startsWith('json:')).toBe(true)

    // Verify it decodes back correctly
    const decoded = decodeStoryAudioPayload(encoded)
    expect(decoded.audioUrl).toBe('http://example.com/full.wav')
    expect(decoded.sceneAudioUrls).toEqual(['http://example.com/s1.wav', 'http://example.com/s2.wav'])
  })

  it('filters out falsy sceneAudioUrls', () => {
    const payload = {
      audioUrl: 'http://a.wav',
      sceneAudioUrls: ['http://s1.wav', '', 'http://s2.wav'],
    }
    const encoded = encodeStoryAudioPayload(payload)
    const decoded = decodeStoryAudioPayload(encoded)
    expect(decoded.sceneAudioUrls).toEqual(['http://s1.wav', 'http://s2.wav'])
  })
})

describe('decodeStoryAudioPayload', () => {
  it('returns empty defaults for empty string', () => {
    expect(decodeStoryAudioPayload('')).toEqual({ audioUrl: '', sceneAudioUrls: [] })
  })

  it('treats non-prefixed string as plain audioUrl', () => {
    const result = decodeStoryAudioPayload('http://example.com/audio.wav')
    expect(result).toEqual({ audioUrl: 'http://example.com/audio.wav', sceneAudioUrls: [] })
  })

  it('returns empty defaults for malformed base64', () => {
    const result = decodeStoryAudioPayload('json:not-valid-base64!!!!')
    expect(result).toEqual({ audioUrl: '', sceneAudioUrls: [] })
  })

  it('round-trips encode/decode correctly', () => {
    const original = {
      audioUrl: 'http://full.wav',
      sceneAudioUrls: ['http://s1.wav', 'http://s2.wav', 'http://s3.wav'],
    }
    const encoded = encodeStoryAudioPayload(original)
    const decoded = decodeStoryAudioPayload(encoded)
    expect(decoded.audioUrl).toBe(original.audioUrl)
    expect(decoded.sceneAudioUrls).toEqual(original.sceneAudioUrls)
  })

  it('uses first sceneAudioUrl as audioUrl when audioUrl is empty', () => {
    const payload = { audioUrl: '', sceneAudioUrls: ['http://s1.wav'] }
    const encoded = encodeStoryAudioPayload(payload)
    const decoded = decodeStoryAudioPayload(encoded)
    expect(decoded.audioUrl).toBe('http://s1.wav')
  })
})
