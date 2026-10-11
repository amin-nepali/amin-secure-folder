import { useEffect, useRef, useState } from 'react'
import '@material/web/button/filled-button.js'
import '@material/web/button/filled-tonal-button.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/iconbutton/icon-button.js'
import './App.css'

const STORAGE_KEY = 'amin-secure-folder-items'
const AUTH_STORAGE_KEY = 'amin-secure-folder-authenticated'
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

function loadFilesFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultFiles
    const parsed = JSON.parse(raw)
    return {
      images: Array.isArray(parsed.images) ? parsed.images : [],
      videos: Array.isArray(parsed.videos) ? parsed.videos : [],
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    }
  } catch {
    return defaultFiles
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
  const [files, setFiles] = useState(loadFilesFromStorage)
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
  }, [files])

  const currentItems = files[selectedCategory] || []
  const currentCategory = categoryMeta[selectedCategory]

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

  const handleAddFiles = (event) => {
    const incoming = Array.from(event.target.files || [])
    if (!incoming.length) return

    const normalized = incoming.map((file, index) => ({
      id: `${selectedCategory}-${Date.now()}-${index}`,
      name: file.name,
      size: formatBytes(file.size),
      kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document',
      extension: file.name.split('.').pop() || 'file',
      uploadedAt: new Date().toISOString(),
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))

    setFiles((prev) => ({
      ...prev,
      [selectedCategory]: [...(prev[selectedCategory] || []), ...normalized],
    }))

    event.target.value = ''
  }

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

  const removeItem = (itemId) => {
    setFiles((prev) => ({
      ...prev,
      [selectedCategory]: (prev[selectedCategory] || []).filter((item) => item.id !== itemId),
    }))
    setDetailItem(null)
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
              <button type="button" className="logout-button" onClick={handleLogout} title="Sign out" aria-label="Sign out">
                <span className="material-symbols-rounded">logout</span>
              </button>
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

      {(screen === 'screen4' || screen === 'screen4-copy' || screen === 'screen4-copy-copy') && (
        <div className="screen gallery-screen">
          <div className="gallery-header">
            <md-filled-button className="back-button" onClick={goBack}>
              <span slot="icon" className="material-symbols-rounded">arrow_back</span>
              Go back
            </md-filled-button>

            <md-filled-button className="add-button" onClick={() => fileInputRef.current?.click()}>
              Add files
            </md-filled-button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleAddFiles} />
          </div>

          <div className="file-grid">
            {currentItems.length === 0 ? (
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
