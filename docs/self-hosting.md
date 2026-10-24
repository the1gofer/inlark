# Self-hosting inlark

The self-hosted web version runs the inlark mail service on a home server in Docker. You open the normal inlark interface from a browser on any of your devices.

It is built for one person: one server password and one person's mail. It is meant to be reached over a private network such as Tailscale. Never expose it directly to the internet.

## Run it

On the server, find its Tailscale address:

```sh
tailscale ip -4
```

In `docker-compose.yml`, replace `100.x.y.z` in the published port with that address, then run this from the repo root:

```sh
docker compose up -d --build
```

Open `http://<tailscale-ip>:8080` from another device on your tailnet.

Without Compose, build and run the image yourself:

```sh
docker build -t inlark-web .
docker run -d --name inlark --restart unless-stopped \
  -v inlark-data:/data \
  -p <tailscale-ip>:8080:8080 \
  inlark-web
```

Publishing the port on the Tailscale address keeps it off your other network interfaces.

## Use HTTPS

Plain HTTP over Tailscale works, but browsers only allow desktop notifications and clipboard copy on HTTPS pages (a secure context), so HTTPS is recommended.

Let `tailscale serve` provide it:

```sh
tailscale serve --bg 8080
```

Then bind the container port to `127.0.0.1` instead of the Tailscale address (`127.0.0.1:8080:8080`) and set `INLARK_SECURE_COOKIE=true`. In `docker-compose.yml`, uncomment that line under `environment`. With `docker run`, add `-e INLARK_SECURE_COOKIE=true`.

Open the HTTPS address that `tailscale serve` prints.

## Sign in for the first time

If `INLARK_PASSWORD` is not set, the first visit asks you to choose a password of at least 10 characters. Whoever reaches the page first sets it, so start inlark only where you alone can reach it. Otherwise set `INLARK_PASSWORD` or `INLARK_PASSWORD_FILE` before the first start.

## Configuration

Set these as environment variables on the container.

| Variable               | Default              | Purpose                                                                                                |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `PORT`                 | `8080`               | Port the service listens on inside the container.                                                      |
| `HOST`                 | `0.0.0.0`            | Address the service listens on.                                                                        |
| `INLARK_DATA_DIR`      | `/data` in the image | Where inlark keeps its data.                                                                           |
| `INLARK_PASSWORD`      | unset                | Server password. If unset, you choose one in the browser on first visit.                               |
| `INLARK_PASSWORD_FILE` | unset                | Path to a file containing the password, such as a Docker secret.                                       |
| `INLARK_SECRET_KEY`    | generated            | 32-byte key as 64 hex characters or base64. If unset, one is generated into `/data/server/secret.key`. |
| `INLARK_SECURE_COOKIE` | `false`              | Set to `true` when you serve inlark over HTTPS.                                                        |

## Data and backups

Everything lives in the `/data` volume:

- `/data/mail` holds accounts, settings, drafts and the mail index.
- `/data/server` holds `auth.json`, which has the hashed password and hashed session tokens, and `secret.key`.

Saved mail passwords are encrypted with AES-256-GCM under the secret key. If the key sits in the same volume, anyone with a copy of the volume can read those passwords. If that matters, supply the key from elsewhere with `INLARK_SECRET_KEY`. Generate one with:

```sh
openssl rand -hex 32
```

Keep that key safe. Without it, saved mail passwords can't be decrypted, and you will need to enter them again.

Back up the volume regularly. Keep backups as private as the server itself.

## Update

```sh
git pull
docker compose up -d --build
```

The in-app updater is off in the web version. Your data stays in the volume.

## How it differs from the desktop app

- **Attachments** upload from your browser and download to it.
- **Save and open** downloads the file. Open it from your browser's downloads.
- **Notifications** are browser notifications. The browser asks for permission on your first click, and a notification appears only when no inlark tab is in front.
- **Verification codes** are copied automatically only while an inlark tab is focused.
- **Small screens**: the interface is the desktop layout. It works on a phone but is cramped, so a phone mail app on the same account is the better fit there.
- **Tabs**: you can open inlark in several tabs at once.

## Development

```sh
pnpm install
pnpm build:web-server
INLARK_DATA_DIR=./.test-data/web pnpm start:web-server
```
