# Dify TRPG Custom Frontend

Custom desktop and mobile frontend for a Dify TRPG game.

The browser never calls Dify directly. It calls this app's Express proxy at `/api/chat`, and the proxy sends requests to the Dify Chat API using the server-side `DIFY_API_KEY`.

## Local Testing

Install dependencies:

```powershell
npm install
```

Create `.env` from the example:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

```text
DIFY_API_KEY=app-your-real-dify-api-key
DIFY_BASE_URL=https://api.dify.ai/v1
PORT=3000
```

Start the server:

```powershell
npm start
```

Open:

```text
http://localhost:3000/
http://localhost:3000/mobile/
http://localhost:3000/desktop/
```

Health check:

```text
http://localhost:3000/health
```

It should return:

```json
{ "ok": true }
```

## Deployment Environment Variables

Set these in your hosting provider dashboard:

```text
DIFY_API_KEY=app-your-real-dify-api-key
DIFY_BASE_URL=https://api.dify.ai/v1
PORT=3000
```

Many platforms provide `PORT` automatically. Keeping `PORT=3000` is fine for local use, but on Render/Railway the app also supports the platform-provided `process.env.PORT`.

## Render Deployment

1. Push this project to GitHub.
2. In Render, create a new Web Service.
3. Connect the GitHub repository.
4. Use:

```text
Environment: Node
Build Command: npm install
Start Command: npm start
```

5. Add environment variables:

```text
DIFY_API_KEY=app-your-real-dify-api-key
DIFY_BASE_URL=https://api.dify.ai/v1
```

6. Deploy.

After deployment, open:

```text
https://your-render-app.onrender.com/mobile/
```

## Railway Deployment

1. Push this project to GitHub.
2. In Railway, create a new project from the GitHub repository.
3. Railway should detect Node automatically.
4. Use:

```text
Start Command: npm start
```

5. Add environment variables:

```text
DIFY_API_KEY=app-your-real-dify-api-key
DIFY_BASE_URL=https://api.dify.ai/v1
```

6. Deploy and generate/open the public domain.

After deployment, open:

```text
https://your-railway-domain.up.railway.app/mobile/
```

## Routes

- `/` launcher page with `Open Mobile` and `Open Desktop`
- `/mobile/` mobile-first TRPG client
- `/desktop/` desktop HUD client
- `/api/chat` server-side Dify proxy
- `/health` deployment health check

## Project Structure

```text
server/
  server.js                  Express app entry point
  routes/chat.js             /api/chat validation and route handling
  services/difyClient.js     Dify Chat API request logic

public/
  index.html                 Landing launcher
  desktop/                   Desktop-only UI
  mobile/                    Mobile-only UI
  shared/                    Shared browser logic
  js/                        Original desktop modules used by shared exports
  css/                       Shared/legacy CSS files
  assets/                    Optional icons and backgrounds
```

## Security

Do not put `DIFY_API_KEY` in frontend JavaScript.

For a public website, consider adding authentication or a private access layer so only you can use the proxy. Without that, anyone with the URL could spend your Dify API quota.
