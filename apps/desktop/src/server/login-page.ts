const messages: Record<string, string> = {
  wrong: 'That password is not right.',
  locked: 'Too many attempts. Try again in 15 minutes.',
  mismatch: 'The passwords do not match.',
  short: 'Use at least 10 characters.',
}

/** The sign-in page, and on first run the page that sets the server password. */
export function loginPage({ setup, error }: { setup: boolean; error: string | null }) {
  const message = error && messages[error]
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark light" />
<title>inlark</title>
<style>
  :root { --bg: #111112; --card: #19191b; --text: #ededef; --muted: #8b8b93; --border: #2a2a2e; --accent: #6e7bf2; --error: #f07171; }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f7f8fa; --card: #ffffff; --text: #1b1c1f; --muted: #6b6f76; --border: #e2e4e8; --error: #c93c3c; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 16px;
    background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  form { width: 100%; max-width: 340px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  p { color: var(--muted); margin: 0 0 20px; }
  label { display: block; font-size: 12px; font-weight: 500; margin: 14px 0 6px; }
  input { width: 100%; padding: 9px 11px; border-radius: 7px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; }
  input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  button { width: 100%; margin-top: 20px; padding: 9px; border: 0; border-radius: 7px; background: var(--accent); color: #fff; font: inherit; font-weight: 500; cursor: pointer; }
  .error { color: var(--error); margin: 14px 0 0; }
</style>
</head>
<body>
<form method="post" action="${setup ? '/setup' : '/login'}">
  <h1>inlark</h1>
  <p>${setup ? 'Choose a password for this server. You will use it to sign in from any browser.' : 'Sign in to your mail.'}</p>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required autofocus ${setup ? 'minlength="10"' : ''} />
  ${setup ? '<label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength="10" />' : ''}
  ${message ? `<p class="error" role="alert">${message}</p>` : ''}
  <button type="submit">${setup ? 'Set password' : 'Sign in'}</button>
</form>
</body>
</html>`
}
