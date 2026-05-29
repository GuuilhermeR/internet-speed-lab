import { createReadStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { handleSpeedApi } from './speed-api.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = normalize(join(__dirname, '..', 'dist'))
const port = Number(process.env.PORT || 4173)

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const sendStatic = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const requestedPath = decodeURIComponent(url.pathname)
  const safePath = normalize(join(root, requestedPath))
  const filePath =
    safePath.startsWith(root) && existsSync(safePath) ? safePath : join(root, 'index.html')

  res.statusCode = 200
  res.setHeader('Content-Type', mimeTypes[extname(filePath)] || 'application/octet-stream')
  createReadStream(filePath).pipe(res)
}

const server = createServer((req, res) => {
  handleSpeedApi(req, res, () => sendStatic(req, res))
})

server.listen(port, () => {
  console.log(`Internet Speed Lab running at http://localhost:${port}`)
})
