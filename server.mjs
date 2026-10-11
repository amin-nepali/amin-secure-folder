import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { extname, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'

const host = '0.0.0.0'
const port = Number(process.env.PORT || 4174)
const distRoot = resolve('dist')
const rooms = new Map()
const roomLifetimeMs = 10 * 60 * 1000
const maxTransferBytes = 20 * 1024 * 1024
const maxChunkBytes = 64 * 1024

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function getLanAddresses() {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}`)
}

function respondJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  if (requestUrl.pathname === '/api/lan') {
    respondJson(response, 200, { addresses: getLanAddresses(), port })
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(requestUrl.pathname)
  } catch {
    response.writeHead(400)
    response.end('Invalid URL')
    return
  }

  const requested = resolve(distRoot, `.${pathname}`)
  if (requested !== distRoot && !requested.startsWith(`${distRoot}${sep}`)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  const filePath = existsSync(requested) && statSync(requested).isFile()
    ? requested
    : resolve(distRoot, 'index.html')
  if (!existsSync(filePath)) {
    response.writeHead(503)
    response.end('Run npm run build before starting the LAN server.')
    return
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
  })
  createReadStream(filePath).pipe(response)
})

const webSocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: maxChunkBytes,
})

server.on('upgrade', (request, socket, head) => {
  if (new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname !== '/share') {
    socket.destroy()
    return
  }
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit('connection', webSocket, request)
  })
})

function sendJson(webSocket, payload) {
  if (webSocket.readyState === WebSocket.OPEN) webSocket.send(JSON.stringify(payload))
}

function closeRoom(room) {
  clearTimeout(room.expiry)
  rooms.delete(room.code)
}

webSocketServer.on('connection', (webSocket) => {
  let room
  let role
  let transferSize = 0
  let transferStarted = false

  webSocket.on('message', (raw, isBinary) => {
    if (isBinary) {
      if (role !== 'sender' || !room?.receiver || !transferStarted || raw.byteLength > maxChunkBytes) {
        sendJson(webSocket, { type: 'error', message: 'File transfer is not ready.' })
        return
      }
      transferSize += raw.byteLength
      if (transferSize > maxTransferBytes) {
        sendJson(webSocket, { type: 'error', message: 'Files are limited to 20 MB.' })
        room.receiver.close(1009, 'File exceeds limit')
        closeRoom(room)
        return
      }
      if (room.receiver.readyState === WebSocket.OPEN) room.receiver.send(raw, { binary: true })
      return
    }

    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      sendJson(webSocket, { type: 'error', message: 'Invalid transfer request.' })
      return
    }

    if (message.type === 'create' && !role) {
      let code
      do {
        code = randomBytes(6).toString('hex').toUpperCase()
      } while (rooms.has(code))
      room = { code, receiver: webSocket, sender: null }
      room.expiry = setTimeout(() => {
        sendJson(room.receiver, { type: 'expired', message: 'This sharing code expired. Create a new one.' })
        room.sender?.close(1000, 'Sharing code expired')
        closeRoom(room)
      }, roomLifetimeMs)
      room.expiry.unref()
      rooms.set(code, room)
      role = 'receiver'
      sendJson(webSocket, { type: 'created', code, expiresIn: roomLifetimeMs })
      return
    }

    if (message.type === 'join' && !role) {
      const requestedCode = typeof message.code === 'string' ? message.code.replace(/\s/g, '').toUpperCase() : ''
      const matchingRoom = rooms.get(requestedCode)
      if (!matchingRoom || matchingRoom.sender || matchingRoom.receiver.readyState !== WebSocket.OPEN) {
        sendJson(webSocket, { type: 'error', message: 'Code not found or already in use. Check it and try again.' })
        return
      }
      room = matchingRoom
      room.sender = webSocket
      role = 'sender'
      sendJson(webSocket, { type: 'paired', role })
      sendJson(room.receiver, { type: 'paired', role: 'receiver' })
      return
    }

    if (!room || !role) {
      sendJson(webSocket, { type: 'error', message: 'Create or join a sharing session first.' })
      return
    }

    if (message.type === 'begin' && role === 'sender' && room.receiver?.readyState === WebSocket.OPEN) {
      const name = typeof message.name === 'string' ? message.name.slice(0, 240) : ''
      const size = Number(message.size)
      const type = typeof message.fileType === 'string' ? message.fileType.slice(0, 120) : 'application/octet-stream'
      if (!name || !Number.isSafeInteger(size) || size < 0 || size > maxTransferBytes) {
        sendJson(webSocket, { type: 'error', message: 'Invalid file details or file exceeds 20 MB.' })
        return
      }
      transferSize = 0
      transferStarted = true
      sendJson(room.receiver, { type: 'file-start', name, size, fileType: type })
      return
    }

    if (message.type === 'complete' && role === 'sender' && transferStarted) {
      transferStarted = false
      sendJson(room.receiver, { type: 'file-complete' })
      sendJson(webSocket, { type: 'sent' })
      closeRoom(room)
      room.receiver.close(1000, 'Transfer complete')
      webSocket.close(1000, 'Transfer complete')
      return
    }

    if (message.type === 'cancel' && role === 'sender') {
      sendJson(room.receiver, { type: 'cancelled', message: 'The sender cancelled the transfer.' })
      closeRoom(room)
      room.receiver.close(1000, 'Transfer cancelled')
      webSocket.close(1000, 'Transfer cancelled')
    }
  })

  webSocket.on('error', (error) => {
    console.error('AShare connection error:', error.message)
  })

  webSocket.on('close', () => {
    if (!room || !rooms.has(room.code)) return
    if (role === 'sender') {
      sendJson(room.receiver, { type: 'peer-left', message: 'The sender disconnected.' })
      room.sender = null
    } else {
      room.sender?.close(1000, 'Receiver disconnected')
      closeRoom(room)
    }
  })
})

server.listen(port, host, () => {
  console.log(`AShare local server listening on http://localhost:${port}`)
  const addresses = getLanAddresses()
  if (addresses.length) console.log(`On the same Wi-Fi/LAN, open: ${addresses.join('  ')}`)
  else console.log('No LAN IPv4 address found. Check that the computer is connected to Wi-Fi.')
  console.log('Stop sharing by stopping this process. Sharing codes expire after 10 minutes.')
})

function shutdown() {
  webSocketServer.clients.forEach((client) => client.close(1001, 'Server is shutting down'))
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 3000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
