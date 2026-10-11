import { useEffect, useRef, useState } from 'react'
import '@material/web/button/filled-button.js'
import '@material/web/button/filled-tonal-button.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/iconbutton/icon-button.js'
import './App.css'

const AUTH_STORAGE_KEY = 'amin-secure-folder-authenticated'
const FILE_DATABASE = 'amin-secure-folder-files'
const FILE_STORE = 'files'
const MAX_FILE_SIZE = 20 * 1024 * 1024
const defaultFiles = {
  images: [],
  videos: [],
  documents: [],
}

const navItems = [
  { key: 'Account', label: 'Account', icon: 'person' },
  { key: 'Settings', label: 'Settings', icon: 'settings' },
  { key: 'Files', label: 'Files', icon: 'folder' },
  { key: 'Vault', label: 'Vault', icon: 'lock' },
]

const categoryMeta = {
  images: { label: 'IMAGES', screen: 'screen4', icon: 'image' },
  videos: { label: 'VIDEOS', screen: 'screen4-copy', icon: 'movie' },
  documents: { label: 'DOCUMENTS', screen: 'screen4-copy-copy', icon: 'description' },
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

function openFileDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support local file storage.'))
      return
    }

    const request = window.indexedDB.open(FILE_DATABASE, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open local file storage.'))
  })
}

async function getStoredFiles() {
  const database = await openFileDatabase()
  try {
    const transaction = database.transaction(FILE_STORE, 'readonly')
    const request = transaction.objectStore(FILE_STORE).getAll()
    const records = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Could not read saved files.'))
    })
    return records.map(({ blob, ...item }) => ({
      ...item,
      preview: item.kind === 'image' && blob ? URL.createObjectURL(blob) : null,
    }))
  } finally {
    database.close()
  }
}

async function saveFileRecords(records) {
  const database = await openFileDatabase()
  try {
    const transaction = database.transaction(FILE_STORE, 'readwrite')
    const store = transaction.objectStore(FILE_STORE)
    records.forEach((record) => {
      const savedRecord = { ...record }
      delete savedRecord.preview
      store.put(savedRecord)
    })
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error || new Error('Could not save files.'))
      transaction.onabort = () => reject(transaction.error || new Error('Saving files was cancelled.'))
    })
  } finally {
    database.close()
  }
}

async function getStoredFile(id) {
  const database = await openFileDatabase()
  try {
    const transaction = database.transaction(FILE_STORE, 'readonly')
    const request = transaction.objectStore(FILE_STORE).get(id)
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Could not read the saved file.'))
    })
  } finally {
    database.close()
  }
}

async function deleteStoredFile(id) {
  const database = await openFileDatabase()
  try {
    const transaction = database.transaction(FILE_STORE, 'readwrite')
    transaction.objectStore(FILE_STORE).delete(id)
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error || new Error('Could not delete the file.'))
      transaction.onabort = () => reject(transaction.error || new Error('Deleting the file was cancelled.'))
    })
  } finally {
    database.close()
  }
}

function App() {
  const [screen, setScreen] = useState('loader')
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return window.localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [sessionError, setSessionError] = useState('')
  const [navExpanded, setNavExpanded] = useState(false)
  const [activeItem, setActiveItem] = useState('Account')
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [files, setFiles] = useState(defaultFiles)
  const [filesLoading, setFilesLoading] = useState(true)
  const [fileError, setFileError] = useState('')
  const [shareMode, setShareMode] = useState(null)
  const [shareCodeInput, setShareCodeInput] = useState('')
  const [shareCode, setShareCode] = useState('')
  const [shareStatus, setShareStatus] = useState('')
  const [shareError, setShareError] = useState('')
  const [shareAddresses, setShareAddresses] = useState([])
  const [shareFile, setShareFile] = useState(null)
  const [shareProgress, setShareProgress] = useState(0)
  const [isTransferring, setIsTransferring] = useState(false)
  const [sharePeerFound, setSharePeerFound] = useState(false)
  const [shareServerReady, setShareServerReady] = useState(null)
  const shareSocketRef = useRef(null)
  const shareChunksRef = useRef([])
  const incomingFileRef = useRef(null)
  const shareFileInputRef = useRef(null)
  const [selectedCategory, setSelectedCategory] = useState('images')
  const [detailItem, setDetailItem] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (screen !== 'loader') return

    const timeout = window.setTimeout(() => {
      if (isOnline) {
        setScreen(isAuthenticated ? 'screen3' : 'login')
      }
    }, 1800)

    return () => window.clearTimeout(timeout)
  }, [isAuthenticated, isOnline, screen])

  useEffect(() => {
    let cancelled = false
    getStoredFiles()
      .then((stored) => {
        if (cancelled) {
          stored.forEach((item) => {
            if (item.preview) URL.revokeObjectURL(item.preview)
          })
          return
        }

        setFiles({
          images: stored.filter((item) => item.category === 'images'),
          videos: stored.filter((item) => item.category === 'videos'),
          documents: stored.filter((item) => item.category === 'documents'),
        })
        setFileError('')
      })
      .catch((error) => {
        if (!cancelled) setFileError(`Local storage could not be loaded: ${error.message}`)
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (screen !== 'ashare') return

    fetch('/api/lan')
      .then((response) => {
        if (!response.ok) throw new Error('The local sharing server is not running.')
        return response.json()
      })
      .then(({ addresses }) => {
        setShareAddresses(addresses)
        setShareServerReady(true)
      })
      .catch(() => {
        setShareAddresses([])
        setShareServerReady(false)
      })
  }, [screen])

  useEffect(() => {
    if (screen !== 'ashare' || !shareMode) return

    let disposed = false
    const socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/share`)
    shareSocketRef.current = socket
    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      if (disposed) return
      if (shareMode === 'receive') {
        socket.send(JSON.stringify({ type: 'create' }))
      } else {
        setShareStatus('Enter the receiver’s one-time code to connect.')
      }
    }

    socket.onmessage = async (event) => {
      if (disposed) return
      if (typeof event.data !== 'string') {
        shareChunksRef.current.push(event.data)
        const incoming = incomingFileRef.current
        if (incoming) {
          incoming.received += event.data.byteLength
          setShareProgress(Math.min(99, Math.round((incoming.received / incoming.size) * 100)))
        }
        return
      }

      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        setShareError('Received an invalid message from the local sharing server.')
        return
      }

      if (message.type === 'created') {
        setShareCode(message.code)
        setShareStatus('Waiting for the other device to enter your code.')
      } else if (message.type === 'paired') {
        setSharePeerFound(true)
        setShareStatus(shareMode === 'receive' ? 'Device connected. Ready to receive a file.' : 'Receiver found. Choose a file to send.')
        setShareError('')
      } else if (message.type === 'file-start' && shareMode === 'receive') {
        if (message.size > MAX_FILE_SIZE) {
          setShareError('This file is larger than the 20 MB transfer limit.')
          socket.send(JSON.stringify({ type: 'cancel' }))
          return
        }
        shareChunksRef.current = []
        incomingFileRef.current = { ...message, received: 0 }
        setIsTransferring(true)
        setShareProgress(0)
        setShareStatus(`Receiving ${message.name}…`)
      } else if (message.type === 'file-complete' && shareMode === 'receive') {
        const incoming = incomingFileRef.current
        if (!incoming || incoming.received !== incoming.size) {
          setShareError('The transfer was incomplete. Please try again.')
          setIsTransferring(false)
          incomingFileRef.current = null
          shareChunksRef.current = []
          return
        }
        const blob = new Blob(shareChunksRef.current, { type: incoming.fileType })
        const category = incoming.fileType.startsWith('image/')
          ? 'images'
          : incoming.fileType.startsWith('video/')
            ? 'videos'
            : 'documents'
        const record = {
          id: `shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          category,
          name: incoming.name,
          size: formatBytes(blob.size),
          kind: category === 'images' ? 'image' : category === 'videos' ? 'video' : 'document',
          type: incoming.fileType || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
          blob,
        }
        try {
          await saveFileRecords([record])
          setFiles((previous) => ({ ...previous, [category]: [...previous[category], {
            ...record,
            preview: category === 'images' ? URL.createObjectURL(blob) : null,
          }] }))
          setShareStatus(`${incoming.name} received and saved to ${category}.`)
          setShareProgress(100)
          setShareError('')
        } catch (error) {
          setShareError(`Received the file but could not save it on this device: ${error.message}`)
        }
        shareChunksRef.current = []
        incomingFileRef.current = null
        setIsTransferring(false)
      } else if (message.type === 'sent') {
        setShareProgress(100)
        setShareStatus('File sent successfully.')
        setIsTransferring(false)
      } else if (message.type === 'expired' || message.type === 'cancelled' || message.type === 'peer-left' || message.type === 'error') {
        setShareStatus(message.message || 'The connection ended.')
        if (message.type !== 'cancelled') setShareError(message.message || 'The connection ended.')
        setIsTransferring(false)
        if (message.type === 'expired') setShareCode('')
      }
    }

    socket.onerror = () => {
      if (!disposed) setShareError('Could not connect to the AShare server. Start it with npm run lan on the host computer.')
    }
    socket.onclose = () => {
      if (!disposed && shareSocketRef.current === socket) shareSocketRef.current = null
    }

    return () => {
      disposed = true
      if (shareSocketRef.current === socket) shareSocketRef.current = null
      if (socket.readyState < WebSocket.CLOSING) socket.close()
      shareChunksRef.current = []
      incomingFileRef.current = null
    }
  }, [screen, shareMode])

  const currentItems = files[selectedCategory] || []
  const currentCategory = categoryMeta[selectedCategory]

  const closeShare = () => {
    shareSocketRef.current?.close()
    shareSocketRef.current = null
    setShareMode(null)
    setShareCode('')
    setShareCodeInput('')
    setShareFile(null)
    setShareProgress(0)
    setIsTransferring(false)
    setSharePeerFound(false)
    setShareStatus('')
    setShareError('')
    setScreen('screen3')
  }

  const connectToReceiver = () => {
    const code = shareCodeInput.trim().replace(/\s/g, '').toUpperCase()
    if (!/^[A-F0-9]{12}$/.test(code)) {
      setShareError('Enter the 12-character code shown on the receiving device.')
      return
    }
    if (shareSocketRef.current?.readyState !== WebSocket.OPEN) {
      setShareError('Not connected to the local sharing server yet. Try again in a moment.')
      return
    }
    shareSocketRef.current.send(JSON.stringify({ type: 'join', code }))
    setShareStatus('Looking for the receiver…')
    setShareError('')
  }

  const startShare = (mode) => {
    setShareMode(mode)
    setShareCode('')
    setShareCodeInput('')
    setShareFile(null)
    setShareProgress(0)
    setIsTransferring(false)
    setShareError('')
    setSharePeerFound(false)
    setShareStatus(mode === 'receive' ? 'Creating a one-time receiving code…' : 'Connecting to this local network…')
  }

  const copyShareCode = async () => {
    try {
      await navigator.clipboard.writeText(shareCode)
      setShareStatus('Sharing code copied.')
    } catch {
      setShareError('Clipboard access is unavailable. Enter the code manually on the sending device.')
    }
  }

  const sendShareFile = async () => {
    const socket = shareSocketRef.current
    if (!shareFile || !sharePeerFound || socket?.readyState !== WebSocket.OPEN) return
    if (shareFile.size > MAX_FILE_SIZE) {
      setShareError('Choose a file that is 20 MB or smaller.')
      return
    }

    setShareProgress(0)
    setIsTransferring(true)
    setShareStatus('Sending file…')
    setShareError('')
    socket.send(JSON.stringify({
      type: 'begin',
      name: shareFile.name,
      size: shareFile.size,
      fileType: shareFile.type || 'application/octet-stream',
    }))

    try {
      const buffer = await shareFile.arrayBuffer()
      const chunkSize = 48 * 1024
      for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
        while (socket.bufferedAmount > 512 * 1024) {
          await new Promise((resolve) => window.setTimeout(resolve, 30))
          if (socket.readyState !== WebSocket.OPEN) throw new Error('The receiver disconnected.')
        }
        const chunk = buffer.slice(offset, Math.min(offset + chunkSize, buffer.byteLength))
        socket.send(chunk)
        setShareProgress(Math.round((Math.min(offset + chunk.byteLength, buffer.byteLength) / buffer.byteLength) * 100))
      }
      socket.send(JSON.stringify({ type: 'complete' }))
    } catch (error) {
      setShareError(`Could not send the file: ${error.message}`)
      setShareStatus('Transfer stopped.')
      setIsTransferring(false)
    }
  }

  const handleLogin = (event) => {
    event.preventDefault()

    if (user.trim() === 'aminnepali7' && password === 'Amin@123') {
      try {
        window.localStorage.setItem(AUTH_STORAGE_KEY, 'true')
      } catch {
        setLoginError('Unable to save your session in this browser. Please allow site storage and try again.')
        return
      }
      setIsAuthenticated(true)
      setLoginError('')
      setScreen('screen3')
      return
    }

    setLoginError('Incorrect username or password.')
  }

  const handleAddFiles = async (event) => {
    const incoming = Array.from(event.target.files || [])
    if (!incoming.length) return

    const tooLarge = incoming.filter((file) => file.size > MAX_FILE_SIZE)
    if (tooLarge.length) {
      setFileError(`Each file must be 20 MB or smaller. Too large: ${tooLarge.map((file) => file.name).join(', ')}`)
      event.target.value = ''
      return
    }

    const invalidTypes = incoming.filter((file) => (
      selectedCategory === 'images'
        ? !file.type.startsWith('image/')
        : selectedCategory === 'videos'
          ? !file.type.startsWith('video/')
          : file.type.startsWith('image/') || file.type.startsWith('video/')
    ))
    if (invalidTypes.length) {
      setFileError(`Select ${selectedCategory} files for this folder. Unsupported: ${invalidTypes.map((file) => file.name).join(', ')}`)
      event.target.value = ''
      return
    }

    const normalized = incoming.map((file, index) => {
      const id = `${selectedCategory}-${Date.now()}-${index}`
      return {
        id,
        category: selectedCategory,
        name: file.name,
        size: formatBytes(file.size),
        kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document',
        type: file.type || 'application/octet-stream',
        extension: file.name.split('.').pop() || 'file',
        uploadedAt: new Date().toISOString(),
        blob: file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      }
    })

    try {
      await saveFileRecords(normalized)
      setFiles((prev) => ({
        ...prev,
        [selectedCategory]: [
          ...(prev[selectedCategory] || []),
          ...normalized.map((item) => {
            const savedItem = { ...item }
            delete savedItem.blob
            return savedItem
          }),
        ],
      }))
      setFileError('')
    } catch (error) {
      normalized.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview)
      })
      setFileError(`Could not save files in this browser: ${error.message}`)
    }

    event.target.value = ''
  }

  const handleDownload = async (item) => {
    try {
      const record = await getStoredFile(item.id)
      if (!record?.blob) throw new Error('The saved file data is missing.')

      const url = URL.createObjectURL(record.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = item.name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setFileError('')
    } catch (error) {
      setFileError(`Could not download this file: ${error.message}`)
    }
  }

  const acceptForCategory = {
    images: 'image/*',
    videos: 'video/*',
    documents: '*/*',
  }[selectedCategory]

  const openCategory = (category) => {
    setSelectedCategory(category)
    setScreen(categoryMeta[category].screen)
  }

  const goBack = () => setScreen('screen3')

  const handleLogout = () => {
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    } catch {
      setSessionError('Unable to clear the saved session in this browser.')
      return
    }
    setSessionError('')
    setIsAuthenticated(false)
    setUser('')
    setPassword('')
    setScreen('login')
  }

  const removeItem = async (itemId) => {
    try {
      await deleteStoredFile(itemId)
      const item = currentItems.find((entry) => entry.id === itemId)
      if (item?.preview) URL.revokeObjectURL(item.preview)
      setFiles((prev) => ({
        ...prev,
        [selectedCategory]: (prev[selectedCategory] || []).filter((entry) => entry.id !== itemId),
      }))
      setDetailItem(null)
      setFileError('')
    } catch (error) {
      setFileError(`Could not delete this file: ${error.message}`)
    }
  }

  return (
    <div className="app-shell">
      {screen === 'loader' && (
        <div className="screen loader-screen">
          <div className="loading-orb" aria-label="Checking internet access" />
          <div className="progress-wave" aria-hidden="true" />
          <p className="loader-label">Checking internet access</p>
          {!isOnline && (
            <div className="offline-banner">
              <span className="material-symbols-rounded">wifi_off</span>
              <span>Connection unavailable</span>
              <button type="button" className="inline-action" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {screen === 'login' && (
        <div className="screen login-screen">
          <div className="login-wrapper">
            <div className="brand-block">
              <h1 className="brand-title">Amin Secure</h1>
              <h2 className="brand-subtitle">Folder</h2>
            </div>

            <form className="login-form" onSubmit={handleLogin}>
              <h3>LOGIN</h3>

              <md-outlined-text-field
                label="Username"
                value={user}
                onInput={(event) => setUser(event.target.value)}
                autocomplete="username"
              >
                <span slot="leading-icon" className="material-symbols-rounded">person</span>
              </md-outlined-text-field>

              <md-outlined-text-field
                label="Password"
                type="password"
                value={password}
                onInput={(event) => setPassword(event.target.value)}
                autocomplete="current-password"
              >
                <span slot="leading-icon" className="material-symbols-rounded">lock</span>
              </md-outlined-text-field>

              {loginError && <div className="error-message">{loginError}</div>}

              <md-filled-button className="login-button" type="submit">
                LOG IN
              </md-filled-button>
            </form>
          </div>
        </div>
      )}

      {screen === 'screen3' && (
        <div className="screen gallery-nav-screen">
          <aside className={`nav-rail ${navExpanded ? 'expanded' : 'collapsed'}`}>
            <button type="button" className="menu-button" onClick={() => setNavExpanded((current) => !current)}>
              <span className="material-symbols-rounded">menu</span>
            </button>

            <nav className="rail-menu" aria-label="Navigation rail">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`rail-item ${activeItem === item.key ? 'selected' : ''}`}
                  onClick={() => setActiveItem(item.key)}
                >
                  <span className="material-symbols-rounded">{item.icon}</span>
                  {navExpanded && <span className="rail-label">{item.label}</span>}
                </button>
              ))}
            </nav>
          </aside>

          <main className="category-panel">
            <header className="category-heading">
              <div>
                <p className="category-eyebrow">AMIN SECURE</p>
                <h1>Your secure space</h1>
                <p className="category-description">Keep your files together and protected.</p>
                {sessionError && <p className="session-error" role="alert">{sessionError}</p>}
              </div>
              <div className="heading-actions">
                <button type="button" className="ashare-launch" onClick={() => setScreen('ashare')}>
                  <span className="material-symbols-rounded">near_me</span>
                  AShare
                </button>
                <button type="button" className="logout-button" onClick={handleLogout} title="Sign out" aria-label="Sign out">
                  <span className="material-symbols-rounded">logout</span>
                </button>
              </div>
            </header>
            <div className="category-buttons">
              <md-filled-button className="category-button" onClick={() => openCategory('images')}>
                IMAGES
              </md-filled-button>

              <md-filled-button className="category-button" onClick={() => openCategory('videos')}>
                VIDEOS
              </md-filled-button>

              <md-filled-button className="category-button" onClick={() => openCategory('documents')}>
                DOCUMENTS
              </md-filled-button>
            </div>
          </main>
        </div>
      )}

      {screen === 'ashare' && (
        <main className="screen ashare-screen">
          <header className="ashare-header">
            <button type="button" className="ashare-back" onClick={closeShare} aria-label="Back to folders">
              <span className="material-symbols-rounded">arrow_back</span>
            </button>
            <div>
              <p className="category-eyebrow">AMIN SECURE</p>
              <h1>AShare</h1>
              <p className="category-description">Send files between devices on the same Wi-Fi or local network.</p>
            </div>
          </header>

          <div className="network-card">
            <span className="material-symbols-rounded">wifi</span>
            <div>
              <strong>Local network sharing</strong>
              {shareServerReady ? (
                shareAddresses.length ? (
                  <>
                    <p>Open this app on the other device using one of these addresses:</p>
                    <div className="network-addresses">
                      {shareAddresses.map((address) => <code key={address}>{address}</code>)}
                    </div>
                  </>
                ) : (
                  <p>No local network address was found. Check the host computer’s network connection.</p>
                )
              ) : (
                <p>Start the host computer with <code>npm run lan</code>, then use the displayed network address on both devices.</p>
              )}
              <p className="network-warning">The browser cannot read the Wi-Fi name. Use a trusted network; transfers are local and not end-to-end encrypted.</p>
            </div>
          </div>

          {!shareMode ? (
            <section className="share-actions" aria-label="Choose file sharing action">
              <button type="button" className="share-action-card send-card" onClick={() => startShare('send')}>
                <span className="material-symbols-rounded">upload</span>
                <strong>Send</strong>
                <span>Select a file and send it to a nearby device.</span>
              </button>
              <button type="button" className="share-action-card receive-card" onClick={() => startShare('receive')}>
                <span className="material-symbols-rounded">download</span>
                <strong>Receive</strong>
                <span>Create a temporary code for another device to join.</span>
              </button>
            </section>
          ) : (
            <section className="share-session">
              <div className="share-session-controls">
                <div className="share-mode-heading">
                  <span className="material-symbols-rounded">{shareMode === 'send' ? 'upload' : 'download'}</span>
                  <div>
                    <h2>{shareMode === 'send' ? 'Send a file' : 'Ready to receive'}</h2>
                    <p>{shareStatus}</p>
                  </div>
                </div>

                {shareMode === 'receive' && shareCode && (
                  <div className="secret-code-panel">
                    <span>ONE-TIME RECEIVING CODE</span>
                    <strong>{shareCode}</strong>
                    <button type="button" className="copy-code-button" onClick={copyShareCode}>
                      <span className="material-symbols-rounded">content_copy</span>Copy code
                    </button>
                    <small>Expires after 10 minutes and accepts one sender.</small>
                  </div>
                )}

                {shareMode === 'send' && (
                  <div className="send-controls">
                    <label className="share-input-label" htmlFor="share-code">Receiver code</label>
                    <div className="code-entry-row">
                      <input
                        id="share-code"
                        value={shareCodeInput}
                        onChange={(event) => setShareCodeInput(event.target.value.toUpperCase())}
                        placeholder="12-character code"
                        maxLength={12}
                        autoComplete="off"
                        spellCheck="false"
                      />
                      <button type="button" className="share-secondary-button" onClick={connectToReceiver}>
                        Connect
                      </button>
                    </div>
                    <input
                      ref={shareFileInputRef}
                      type="file"
                      className="share-file-input"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null
                        if (file && file.size > MAX_FILE_SIZE) {
                          setShareFile(null)
                          setShareError('Choose a file that is 20 MB or smaller.')
                        } else {
                          setShareFile(file)
                          setShareError('')
                        }
                      }}
                    />
                    <button type="button" className="share-secondary-button choose-file-button" onClick={() => shareFileInputRef.current?.click()}>
                      <span className="material-symbols-rounded">attach_file</span>
                      {shareFile ? shareFile.name : 'Choose a file (max 20 MB)'}
                    </button>
                    {sharePeerFound && shareFile && (
                      <button type="button" className="share-primary-button" disabled={isTransferring} onClick={sendShareFile}>
                          {isTransferring ? 'Sending…' : 'Send file'}
                      </button>
                    )}
                  </div>
                )}

                {shareMode === 'receive' && sharePeerFound && (
                  <p className="receive-ready"><span className="material-symbols-rounded">verified</span> Sender connected. Waiting for a file…</p>
                )}

                {shareProgress > 0 && (
                  <div className="share-progress-wrap">
                    <progress max="100" value={shareProgress} />
                    <span>{shareProgress}%</span>
                  </div>
                )}
                {shareError && <p className="file-error" role="alert">{shareError}</p>}
                <button type="button" className="share-cancel-button" onClick={closeShare}>Cancel sharing</button>
              </div>

              <div className={`sonar ${sharePeerFound ? 'sonar-connected' : ''}`} aria-label={sharePeerFound ? 'Another device is connected' : 'Searching for another device'}>
                <div className="sonar-sweep" />
                <div className="sonar-ring ring-one" />
                <div className="sonar-ring ring-two" />
                <div className="sonar-ring ring-three" />
                <div className="sonar-axis axis-horizontal" />
                <div className="sonar-axis axis-vertical" />
                <div className="sonarcenter" />
                <div className="sonar-line-to-center" />
                <span className="distance-label">YOU</span>
                <span className="plane-cursor material-symbols-rounded">near_me</span>
                {sharePeerFound && (
                  <>
                    <div className="sonar-line-npc" />
                    <span className="plane-npc material-symbols-rounded">near_me</span>
                    <span className="distance-label-npc">DEVICE FOUND</span>
                  </>
                )}
                <div className="sonar-caption">
                  <span className={`radar-status-dot ${sharePeerFound ? 'found' : ''}`} />
                  {sharePeerFound ? 'DEVICE CONNECTED' : 'SCANNING LOCAL NETWORK'}
                </div>
              </div>
            </section>
          )}
        </main>
      )}

      {(screen === 'screen4' || screen === 'screen4-copy' || screen === 'screen4-copy-copy') && (
        <div className="screen gallery-screen">
          <div className="gallery-header">
            <md-filled-button className="back-button" onClick={goBack}>
              <span slot="icon" className="material-symbols-rounded">arrow_back</span>
              Go back
            </md-filled-button>

            <md-filled-button
              className="add-button"
              disabled={filesLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              {filesLoading ? 'Loading files…' : 'Add files'}
            </md-filled-button>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptForCategory}
              multiple
              hidden
              onChange={handleAddFiles}
            />
          </div>

          <div className="storage-notice">
            <span className="material-symbols-rounded">database</span>
            <span>Saved in this browser only—not cloud-synced or encrypted by the app. Maximum 20 MB per file.</span>
          </div>
          {fileError && <p className="file-error" role="alert">{fileError}</p>}

          <div className="file-grid">
            {filesLoading ? (
              <div className="empty-state">
                <span className="material-symbols-rounded">hourglass_top</span>
                <p>Loading saved files…</p>
              </div>
            ) : currentItems.length === 0 ? (
              <div className="empty-state">
                <span className="material-symbols-rounded">folder_open</span>
                <p>No {currentCategory.label.toLowerCase()} yet.</p>
              </div>
            ) : (
              currentItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="file-tile"
                  onClick={() => setDetailItem(item)}
                  aria-label={`Open ${item.name}`}
                >
                  {item.preview ? (
                    <img src={item.preview} alt={item.name} />
                  ) : (
                    <div className="tile-placeholder">
                      <span className="material-symbols-rounded">
                        {selectedCategory === 'images'
                          ? 'image'
                          : selectedCategory === 'videos'
                            ? 'movie'
                            : 'description'}
                      </span>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {detailItem && (
        <div className="detail-dialog" role="dialog" aria-modal="true">
          <div className="detail-card">
            <div className="detail-preview">
              {detailItem.preview ? (
                <img src={detailItem.preview} alt={detailItem.name} />
              ) : (
                <span className="material-symbols-rounded">
                  {selectedCategory === 'images' ? 'image' : selectedCategory === 'videos' ? 'movie' : 'description'}
                </span>
              )}
            </div>

            <div className="detail-meta">
              <p className="detail-name">{detailItem.name}</p>
              <p className="detail-info">{detailItem.kind} • {detailItem.size}</p>
              <p className="detail-info">Added {new Date(detailItem.uploadedAt).toLocaleDateString()}</p>
            </div>

            <div className="detail-actions">
              <button type="button" className="secondary-action" onClick={() => handleDownload(detailItem)}>
                Download
              </button>
              <button type="button" className="secondary-action" onClick={() => setDetailItem(null)}>
                Close
              </button>
              <button type="button" className="danger-action" onClick={() => removeItem(detailItem.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
