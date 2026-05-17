# Connecting OpenPika to Messaging Apps

OpenPika can receive messages from **Telegram**, **Discord**, **Slack**, and **WhatsApp** and reply through them automatically.

---

## How it works

Messaging platforms don't connect to you — you register a URL, and they push messages to it:

```
You (Telegram / Slack / Discord / WhatsApp)
        │
        │  send message
        ▼
Platform's servers
        │
        │  POST https://yourserver.com/webhooks/<platform>
        ▼
Your server  (nginx → OpenPika on port 8080)
        │
        │  agent runs, replies via platform API
        ▼
Platform's servers
        │
        ▼
You (receive reply in app)
```

This means your server must be reachable from the internet over **HTTPS** — all four platforms require it.

---

## Before you start

### What you need

- A server with a public IP address (any VPS: DigitalOcean, Hetzner, Linode, AWS, etc.)
- A domain name pointing at that server (or ngrok for quick testing — see below)
- OpenPika installed and `openpika serve` able to run

### What OpenPika needs

- Port `8080` listening locally (OpenPika default)
- nginx in front of it to handle HTTPS
- A bot token from your platform(s) of choice

---

## Step 1 — HTTPS with nginx (do this once, before any platform setup)

### Install nginx and get a free certificate

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/openpika` (replace `yourserver.com`):

```nginx
server {
    server_name yourserver.com;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}
```

Enable it and get the certificate:

```bash
sudo ln -s /etc/nginx/sites-available/openpika /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourserver.com
```

certbot auto-renews the certificate. You only do this once.

### Firewall rules

Open ports 80 (certificate renewal) and 443 (HTTPS). Keep port 8080 closed to the internet — nginx is the only entry point.

```bash
sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

---

## Step 2 — Start OpenPika

```bash
openpika serve
# Listening on 127.0.0.1:8080
```

Confirm it works:

```bash
curl https://yourserver.com/health
# {"status":"ok","service":"openpika"}
```

---

## Step 3 — Set up your platform

Pick one or more of the sections below.

---

### Telegram

#### Create the bot (2 minutes)

1. Open Telegram, search **@BotFather**, send `/newbot`.
2. Choose a display name and a username (must end in `bot`).
3. BotFather gives you a token: `7123456789:ABCDef...`. Copy it.

#### Add the token to OpenPika

Edit `~/.openpika/config.toml`:

```toml
[messenger]
telegram_bot_token = "7123456789:ABCDef..."
```

Or via environment variable:

```bash
export OPENPIKA__MESSENGER__TELEGRAM_BOT_TOKEN="7123456789:ABCDef..."
```

#### Register the webhook with Telegram (one command)

```bash
curl "https://api.telegram.org/bot7123456789:ABCDef.../setWebhook" \
  --data-urlencode "url=https://yourserver.com/webhooks/telegram"
# {"ok":true,"result":true}
```

#### Test it

Open Telegram, find your bot, send it any message. You should get a reply within a few seconds.

#### Verify the webhook is registered

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Look for `"pending_update_count": 0` and no `"last_error_message"`.

---

### Slack

#### Create the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From scratch**.
2. Give it a name and pick your workspace.
3. Go to **OAuth & Permissions → Bot Token Scopes** and add:
   - `chat:write` — lets the bot send messages
   - `channels:history` — lets it read channel messages
4. Click **Install to Workspace**.
5. Copy the **Bot User OAuth Token** (starts with `xoxb-`).
6. Go to **Basic Information → App Credentials** and copy the **Signing Secret**.

#### Add credentials to OpenPika

```toml
[messenger]
slack_bot_token      = "xoxb-..."
slack_signing_secret = "abc123..."
```

#### Register the webhook

1. Go to **Event Subscriptions** in your Slack app settings and enable events.
2. Set **Request URL** to `https://yourserver.com/webhooks/slack`.
3. Slack sends a test request — OpenPika responds automatically.
4. Under **Subscribe to bot events**, add `message.channels` (add `message.im` for DMs).
5. Save and reinstall the app when prompted.

#### Invite the bot to a channel

In Slack: `/invite @YourBotName`

#### Test it

Post a message in the channel. The bot replies in a thread.

---

### Discord

#### Create the bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.
2. Go to **Bot → Add Bot**, click **Reset Token**, copy the token.
3. On the same page enable **Message Content Intent** (without this, the bot cannot read messages).
4. Paste the token into config:

```toml
[messenger]
discord_bot_token = "your-token-here"
```

#### Invite the bot to your server

Build this URL (replace `APPLICATION_ID` with the ID from **General Information**):

```
https://discord.com/api/oauth2/authorize?client_id=APPLICATION_ID&permissions=2048&scope=bot
```

Open it in a browser and select your server. Permission `2048` = send messages only.

#### Connect messages to OpenPika

**Slash commands:** In your Discord app settings set **Interactions Endpoint URL** to `https://yourserver.com/webhooks/discord`.

**All messages (requires a small bridge):** Discord's gateway uses WebSockets, not webhooks. Run a lightweight bridge that listens on Discord's WebSocket and forwards each message as a POST to `https://yourserver.com/webhooks/discord`:

```json
{"channel_id": "your-channel-id", "content": "the message text"}
```

#### Test it

Send a message in a channel the bot is in. It replies.

---

### WhatsApp

WhatsApp uses the **Meta WhatsApp Business Cloud API** (free tier available).

#### Create a Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App → Business**.
2. Add the **WhatsApp** product.
3. In **WhatsApp → API Setup**, note your **Phone Number ID** and copy the **Access Token**.

```toml
[messenger]
whatsapp_token           = "your-access-token"
whatsapp_phone_number_id = "123456789"
```

#### Register the webhook

1. Go to **WhatsApp → Configuration → Webhook**:
   - **Callback URL**: `https://yourserver.com/webhooks/whatsapp`
   - **Verify token**: any string (use your `webhook_secret` from config.toml)
2. Subscribe to the **messages** field.
3. Meta sends a one-time GET verification request. Add this to your nginx config to handle it:

```nginx
location = /webhooks/whatsapp {
    if ($request_method = GET) {
        return 200 $arg_hub_challenge;
        add_header Content-Type text/plain;
    }
    proxy_pass http://127.0.0.1:8080;
}
```

#### Add a test number

In the Meta developer console, add your personal WhatsApp number as a test recipient.

#### Test it

Send a message from your WhatsApp number to the Meta test number. You get a reply from the agent.

---

## Testing locally with ngrok (no domain needed)

If you don't have a domain yet, ngrok creates a temporary HTTPS tunnel from the internet to your machine.

```bash
# Install ngrok: https://ngrok.com — create a free account, then:
ngrok config add-authtoken <your-token>

# Make sure OpenPika is running first
openpika serve &

# Start the tunnel
ngrok http 8080
# Prints: https://abc123.ngrok-free.app → http://localhost:8080
```

Use the `https://abc123.ngrok-free.app` URL wherever `https://yourserver.com` appears in the steps above.

**Caveats:**
- The URL changes every time ngrok restarts — you must re-run the webhook registration command each time.
- Use the ngrok request inspector at `http://localhost:4040` to see every request hitting your tunnel — invaluable for debugging.
- Don't use ngrok in production. Get a domain and use nginx + Let's Encrypt instead.

---

## Webhook security (optional but recommended)

By default, anyone who knows your webhook URL can send fake messages to your bot. To lock this down, set a signing secret in `~/.openpika/config.toml`:

```toml
[gateway]
webhook_secret = "pick-a-long-random-string"
```

Then pass that secret when registering webhooks. For Telegram:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  --data-urlencode "url=https://yourserver.com/webhooks/telegram" \
  --data-urlencode "secret_token=pick-a-long-random-string"
```

OpenPika then rejects any incoming request that doesn't carry the correct signature.

---

## Checklist before going live

- [ ] `openpika serve` is running and `curl https://yourserver.com/health` returns `{"status":"ok"}`
- [ ] Port 8080 is blocked by the firewall; only ports 443 and 80 are open
- [ ] nginx has a valid HTTPS certificate (`certbot --nginx` succeeded)
- [ ] Bot token is in `config.toml` or as an environment variable
- [ ] Webhook is registered (ran the `setWebhook` / Request URL step for your platform)
- [ ] You've sent a test message and received a reply
