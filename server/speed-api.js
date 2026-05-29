import { Buffer } from 'node:buffer'

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const CHUNK_SIZE = 64 * 1024

const parseBytes = (value, fallback, max) => {
  const bytes = Number.parseInt(value, 10)

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return fallback
  }

  return Math.min(bytes, max)
}

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for']

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }

  return (req.socket.remoteAddress || null)?.replace('::ffff:', '')
}

const isPrivateIp = (ip) => {
  if (!ip) return true
  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  )
}

const getNetworkInfo = async (req, res) => {
  const clientIp = getClientIp(req)

  try {
    if (isPrivateIp(clientIp)) {
      throw new Error('IP privado/local')
    }

    const response = await fetch(`https://ipwho.is/${clientIp}`)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    sendJson(res, 200, {
      ip: data.ip || clientIp,
      provider: data.connection?.isp || data.connection?.org || null,
      city: data.city || null,
      region: data.region || null,
      country: data.country || null,
      timezone: data.timezone?.id || null,
      source: 'ipwho.is',
    })
  } catch {
    sendJson(res, 200, {
      ip: clientIp,
      provider: null,
      city: null,
      region: null,
      country: null,
      timezone: null,
      source: 'servidor local',
    })
  }
}

const sendDownload = (res, bytes) => {
  const chunk = Buffer.alloc(CHUNK_SIZE, 'speed-test-data')
  let remaining = bytes

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Length', bytes)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  const write = () => {
    while (remaining > 0) {
      const size = Math.min(remaining, chunk.length)
      remaining -= size

      if (!res.write(chunk.subarray(0, size))) {
        res.once('drain', write)
        return
      }
    }

    res.end()
  }

  write()
}

const readUpload = (req, res) => {
  let totalBytes = 0
  const startedAt = performance.now()

  req.on('data', (chunk) => {
    totalBytes += chunk.length

    if (totalBytes > MAX_UPLOAD_BYTES) {
      res.statusCode = 413
      res.end('Arquivo enviado é muito grande')
      req.destroy()
    }
  })

  req.on('end', () => {
    const elapsedMs = performance.now() - startedAt
    sendJson(res, 200, { bytes: totalBytes, elapsedMs })
  })

  req.on('error', () => {
    if (!res.writableEnded) {
      sendJson(res, 500, { error: 'Upload interrompido' })
    }
  })
}

export const handleSpeedApi = (req, res, next) => {
  const url = new URL(req.url, 'http://localhost')

  if (!url.pathname.startsWith('/api/')) {
    next?.()
    return
  }

  if (url.pathname === '/api/ping') {
    sendJson(res, 200, { ok: true, serverTime: Date.now() })
    return
  }

  if (url.pathname === '/api/network-info') {
    getNetworkInfo(req, res)
    return
  }

  if (url.pathname === '/api/download') {
    const bytes = parseBytes(
      url.searchParams.get('bytes'),
      10 * 1024 * 1024,
      MAX_DOWNLOAD_BYTES,
    )
    sendDownload(res, bytes)
    return
  }

  if (url.pathname === '/api/upload' && req.method === 'POST') {
    readUpload(req, res)
    return
  }

  sendJson(res, 404, { error: 'Endpoint não encontrado' })
}
