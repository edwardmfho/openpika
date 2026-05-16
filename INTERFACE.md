# Connecting OpenPika to Messaging Apps

OpenPika can send and receive messages through **Telegram**, **Discord**, **Slack**, and **WhatsApp**. You pick which ones you want — you don't have to set up all of them.

> **Before you start:** OpenPika needs to be reachable from the internet over a secure (HTTPS) connection. See [Making OpenPika reachable](#making-openpika-reachable) at the bottom of this page if you haven't done that yet.

---

## Security first — read this before anything else

When you connect a messaging platform, that platform will send messages to a URL on your server. **Without protection, anyone who knows that URL can send fake messages to your bot.** The steps below show you how to lock that down.

### The two things that protect you

**1. Signature verification** — Every platform can "sign" the messages it sends, like a wax seal on a letter. OpenPika can check that seal and reject anything that doesn't have it.

To turn this on, open (or create) `~/.openpika/config.toml` and add:

```toml
[gateway]
webhook_secret = "pick-a-long-random-string-here"
```

Use a password manager to generate something like `xK9#mP2$qL7vR4nW`. Write it down — you'll paste it into the platform's developer settings in a moment.

**2. HTTPS only** — All four platforms will only send messages to `https://` addresses, never plain `http://`. This means traffic to your bot is encrypted in transit. See [Making OpenPika reachable](#making-openpika-reachable) for how to set this up.

### What to keep secret

| What | Where it lives | Never do this |
|------|---------------|---------------|
| Bot tokens | `~/.openpika/config.toml` or environment variables | Paste into chat, commit to git, share in a screenshot |
| `webhook_secret` | `~/.openpika/config.toml` | Share it publicly |
| Your server's port 8080 | Behind nginx/proxy only | Expose port 8080 directly to the internet |

---

## Saving your credentials

You have three ways to configure OpenPika — pick whichever feels most comfortable.

### Option A — The UI (easiest)

Open the OpenPika web interface:

- **Bot tokens** → go to **Channels**, click a platform card, fill in the token fields, and click **Save & Register**.
- **Webhook signing secret** → go to **Settings → Security**, enter your secret, and click **Save**.
- **Gateway URL** → go to **Settings → Gateway Connection** and update the Base URL. The UI will warn you if it's not HTTPS.

### Option B — config.toml file

Open or create the file `~/.openpika/config.toml`:

```toml
[gateway]
webhook_secret = "your-long-random-secret"   # ← the signing secret

[messenger]
telegram_bot_token       = "paste your Telegram token here"
slack_bot_token          = "paste your Slack token here"
slack_signing_secret     = "paste your Slack signing secret here"
discord_bot_token        = "paste your Discord token here"
whatsapp_token           = "paste your WhatsApp access token here"
whatsapp_phone_number_id = "paste your WhatsApp phone number ID here"
```

### Option C — environment variables (Docker / cloud)

Prefix each key with `OPENPIKA__MESSENGER__` in uppercase:

```
OPENPIKA__MESSENGER__TELEGRAM_BOT_TOKEN=...
OPENPIKA__MESSENGER__SLACK_BOT_TOKEN=...
OPENPIKA__GATEWAY__WEBHOOK_SECRET=...
```

You only need one of the three options above — they all do the same thing.

---

## Telegram

### Step 1 — Create a bot (5 minutes)

1. Open Telegram and search for **@BotFather**.
2. Send the message `/newbot`.
3. Choose a display name (e.g. "My Assistant") and a username (must end in `bot`, e.g. `myassistant_bot`).
4. BotFather replies with a **token** that looks like `123456789:ABCDefGhijklmno...`. Copy it.
5. Paste it into `config.toml` as `telegram_bot_token`.

### Step 2 — Tell Telegram where to send messages

Replace the placeholders and run this once in a terminal:

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  --data-urlencode "url=https://<YOUR_DOMAIN>/webhooks/telegram" \
  --data-urlencode "secret_token=<YOUR_WEBHOOK_SECRET>"
```

- `<YOUR_TOKEN>` — the token from BotFather
- `<YOUR_DOMAIN>` — your public domain (e.g. `bot.example.com`)
- `<YOUR_WEBHOOK_SECRET>` — the `webhook_secret` you put in config.toml

The `secret_token` is what locks the door — Telegram will send it with every message, and OpenPika will reject any message that doesn't include it.

### Step 3 — Confirm it worked

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

Look for `"pending_update_count": 0` and no `"last_error_message"`. If you see an error, double-check your domain and that OpenPika is running.

### Step 4 — Test it

Send any message to your bot in Telegram. You should get a reply within a few seconds.

---

## Slack

### Step 1 — Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From scratch**.
2. Give it a name and pick your workspace.
3. Go to **OAuth & Permissions → Scopes → Bot Token Scopes** and add:
   - `chat:write` (lets the bot send messages)
   - `channels:history` (lets it read messages in channels)
4. Click **Install to Workspace** at the top of the same page.
5. Copy the **Bot User OAuth Token** — it starts with `xoxb-`. Paste it into `config.toml` as `slack_bot_token`.
6. Go to **Basic Information → App Credentials** and copy the **Signing Secret**. Paste it as `slack_signing_secret`.

The signing secret is how Slack proves a message really came from Slack. OpenPika checks it on every request.

### Step 2 — Point Slack at your server

1. Go to **Event Subscriptions** and toggle **Enable Events** on.
2. Set **Request URL** to `https://<YOUR_DOMAIN>/webhooks/slack`.
3. Slack will test the URL immediately. OpenPika will respond correctly.
4. Under **Subscribe to bot events**, add `message.channels`. Add `message.groups` or `message.im` if you want the bot to work in private channels or DMs.
5. Click **Save Changes**, then reinstall the app when prompted.

### Step 3 — Invite the bot to a channel

In Slack, type:
```
/invite @YourBotName
```

### Step 4 — Test it

Post a message in that channel. The bot will reply in a thread.

---

## Discord

### Step 1 — Create a bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Go to **Bot → Add Bot**, then click **Reset Token** and copy it. Paste it as `discord_bot_token` in `config.toml`.
3. On the same page, scroll to **Privileged Gateway Intents** and enable **Message Content Intent** — without this, the bot can't read messages.

> **Keep your token safe.** Anyone with this token can control your bot. If it leaks, go back to the portal and reset it immediately.

### Step 2 — Invite the bot to your server

Build this URL, replacing `<APPLICATION_ID>` with your app's ID from the portal's General Information page:

```
https://discord.com/api/oauth2/authorize?client_id=<APPLICATION_ID>&permissions=2048&scope=bot
```

Open it in a browser and select your server. The permission `2048` means "send messages" — nothing more.

### Step 3 — Connect messages to OpenPika

Discord doesn't push messages to a URL by default. You have two options:

**Option A — Slash commands (simpler)**
In your Discord application settings, set the **Interactions Endpoint URL** to `https://<YOUR_DOMAIN>/webhooks/discord`. This works for slash-command style bots.

**Option B — All messages (requires a small bridge)**
Run a lightweight bridge process that listens on Discord's WebSocket and forwards messages to OpenPika. The bridge sends a POST to `https://<YOUR_DOMAIN>/webhooks/discord` with:

```json
{
  "channel_id": "your-channel-id",
  "content": "the message text"
}
```

### Step 4 — Test it

Send a message in a channel your bot is in. It will reply.

---

## WhatsApp

WhatsApp uses the **Meta WhatsApp Business Cloud API**, which has a free tier.

### Step 1 — Create a Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App**.
2. Choose **Business** type and add the **WhatsApp** product.
3. In **WhatsApp → API Setup**, note your **Phone Number ID** and copy your **Access Token**.
4. Paste the phone number ID as `whatsapp_phone_number_id` and the token as `whatsapp_token` in `config.toml`.

### Step 2 — Register your webhook

1. In **WhatsApp → Configuration → Webhook**:
   - **Callback URL**: `https://<YOUR_DOMAIN>/webhooks/whatsapp`
   - **Verify token**: use your `webhook_secret` from config.toml
2. Subscribe to the **messages** webhook field.
3. Meta will send a one-time verification GET request. You need a small proxy rule to respond to it (OpenPika only handles POST). Add this to your nginx config:

```nginx
location = /webhooks/whatsapp {
    if ($request_method = GET) {
        return 200 $arg_hub_challenge;
        add_header Content-Type text/plain;
    }
    proxy_pass http://127.0.0.1:8080;
}
```

### Step 3 — Add a test number

In the Meta developer console, add your personal WhatsApp number as a test recipient.

### Step 4 — Test it

Send a message from your WhatsApp number to the Meta test number. You'll get a reply from the agent.

---

## Making OpenPika reachable

OpenPika listens on port `8080` on your machine. You need two things before any platform can reach it:

**1. A domain name pointing to your server** — e.g. `bot.example.com`

**2. An HTTPS certificate** — the easiest way is [Let's Encrypt](https://letsencrypt.org/) (free)

> The UI will show an amber warning in both **Settings → Gateway Connection** and the platform setup wizard if your Base URL is not HTTPS, so you won't accidentally register a broken webhook URL.

Put nginx in front of OpenPika to handle the HTTPS part. Create a file at `/etc/nginx/sites-available/openpika`:

```nginx
server {
    listen 443 ssl;
    server_name bot.example.com;   # ← your domain

    ssl_certificate     /etc/letsencrypt/live/bot.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bot.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}
```

Do **not** open port `8080` to the internet. Only ports `443` (HTTPS) and `80` (for certificate renewal) need to be accessible. OpenPika should only receive traffic through nginx.

### Testing locally with ngrok

ngrok punches a temporary HTTPS tunnel from the internet to your laptop. It's the fastest way to test without buying a domain or setting up a server.

**Install ngrok**

1. Go to [ngrok.com](https://ngrok.com) and create a free account.
2. Download and install ngrok for your OS.
3. Connect your account (one-time step):
   ```bash
   ngrok config add-authtoken <your-token-from-ngrok-dashboard>
   ```

**Start the tunnel**

Make sure OpenPika is running first, then:

```bash
ngrok http 8080
```

ngrok prints something like:

```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:8080
```

Copy the `https://` URL. Use it as your domain in the webhook setup steps above — for example, the Telegram webhook URL becomes `https://abc123.ngrok-free.app/webhooks/telegram`.

**Update the UI base URL**

Go to **Settings → Gateway Connection** and paste the ngrok URL as the Base URL. The Channels wizard will then show you the correct webhook URL to copy into each platform.

**Best practices and limits for ngrok**

| | Free tier | Paid tier |
|---|---|---|
| URL changes every restart | Yes — you must re-register webhooks each time | No — you can reserve a static domain |
| Connections | Limited | Higher limits |
| Request inspection | Yes, at `http://localhost:4040` | Yes |

- **Never use ngrok in production.** The URL is public and changes. Use a real domain with nginx + Let's Encrypt for anything beyond your own testing.
- **Use the request inspector.** While ngrok is running, open `http://localhost:4040` in your browser. You can see every request that hits your tunnel — the full headers, body, and response. This is invaluable for debugging why a platform isn't connecting.
- **Don't share your ngrok URL publicly.** Even during testing, anyone who knows the URL can send requests to your bot. Your `webhook_secret` protects you here — make sure it's set before you start testing.
- **Keep the terminal open.** Closing the ngrok terminal kills the tunnel. Any registered webhooks will stop working until you start a new tunnel and re-register.
- **Re-register webhooks after every restart (free tier).** Each time ngrok starts it gives you a new URL. You'll need to rerun the webhook registration command (e.g. the Telegram `setWebhook` curl) with the new URL.

**Tip — reserve a stable domain on the free tier**

ngrok lets you reserve one static subdomain on a paid plan, or you can use their free tunnels with a consistent workflow: start ngrok, copy the URL, update the base URL in the OpenPika UI, re-register webhooks. The whole process takes about 30 seconds once you've done it once.

---

## Quick security checklist

Before going live, check each of these:

- [ ] `webhook_secret` is set in `config.toml` and is a long random string (not a real word or phrase)
- [ ] Each platform's developer settings has the signing secret / secret token filled in (not just the webhook URL)
- [ ] Your bot tokens are in `config.toml` or environment variables — not hardcoded in any script or committed to git
- [ ] Port `8080` is blocked by your firewall; only port `443` is open
- [ ] Your domain has a valid HTTPS certificate (check at [ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/))
- [ ] You have tested the bot and confirmed it only responds to real messages from the platform

If any of these are unchecked, your bot could be used by strangers to send arbitrary prompts to your AI agent, running up your API costs.
