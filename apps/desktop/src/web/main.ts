// The bridge must define window.mail before the interface reads it.
import './bridge'
import './web.css'
import '../renderer/src/main'

// After the server is updated, a tab opened earlier asks for parts of the old build, which no
// longer exist. Load the new build instead of failing. Drafts are saved, so nothing is lost; the
// interval keeps a part that is missing for another reason from reloading over and over.
window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try {
    last = Number(sessionStorage.getItem('inlark-reloaded-at')) || 0
    sessionStorage.setItem('inlark-reloaded-at', String(Date.now()))
  } catch {
    /* Without storage, reload anyway; a failed reload shows the error as before. */
  }
  if (Date.now() - last < 30_000) return
  event.preventDefault()
  location.reload()
})
