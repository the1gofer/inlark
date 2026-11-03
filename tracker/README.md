# inlark open tracker

A tiny Cloudflare Worker that serves the 1×1 image inlark adds to tracked messages and logs
every time it loads (time, IP address, user agent, and Cloudflare's country/city/network).
inlark reads the log every two minutes. The Worker never sees message content, only a random
id per message, and logs only ids signed with your secret.

It exists because the inlark server is private (LAN/Tailscale only), so recipients can't reach it.

## Set up (once)

Needs a free Cloudflare account and Node.js. From this folder:

```sh
npx wrangler@4 login
npx wrangler@4 d1 create inlark-tracker        # paste the database_id it prints into wrangler.toml
npx wrangler@4 d1 execute inlark-tracker --remote --file schema.sql
openssl rand -base64 36                         # your tracker secret; keep it
npx wrangler@4 secret put TRACKER_SECRET        # paste the secret
npx wrangler@4 deploy                           # prints https://inlark-tracker.<you>.workers.dev
```

Then in inlark: Settings → Open tracking → paste the address and the same secret → Save.
"Connected" means inlark can read the log.

## What the log can and can't show

- Each entry is a request for the image. That's evidence the message was displayed, not proof
  a person read it.
- Gmail loads images through Google's proxy when the message is opened, so you see Google's IP,
  not the reader's. inlark labels these "Opened in Gmail".
- Apple Mail Privacy Protection can load images when mail arrives, unread. inlark labels these
  "Apple Mail privacy" and doesn't count them as opens.
- Loads within seconds of sending are usually security scanners. Loads from your own internet
  address are you. Neither counts as an open.
- A recipient who blocks images is never recorded.
- A message to several people is sent as one copy per recipient (same headers, same
  Message-ID, each with its own image), so each open names who opened it. Only works on IMAP/SMTP
  accounts; elsewhere one image covers everyone.
- The copy inlark files in Sent has no image. Gmail files its own Sent copy of what it relays, so
  check that copy hasn't kept a recipient's image (see the deploy check in PR #35).
- inlark never loads its own pixels, but opening a sent message in Gmail's web or phone app will
  load it through Google's proxy and look like a Gmail open.
