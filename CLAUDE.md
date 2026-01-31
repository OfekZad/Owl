# Owl Project - Important Information

## API Keys & Services

### Render (Backend Hosting)
- **API Key**: rnd_jrQm9OihMBbQ1VYQMEBw1keynwVq
- **Backend URL**: https://owl-backend-g101.onrender.com
- **Service Name**: owl-backend-g101

### E2B (Sandbox)
- API key in `.env`: E2B_API_KEY

### Vercel (Frontend)
- **URL**: https://owl-ochre.vercel.app

## Deployment

### Trigger Render Deploy
```bash
curl -X POST "https://api.render.com/v1/services/srv-d5ujf84hg0os73av0cbg/deploys" \
  -H "Authorization: Bearer rnd_jrQm9OihMBbQ1VYQMEBw1keynwVq" \
  -H "Content-Type: application/json"
```

### Check Deploy Status
```bash
curl -s "https://api.render.com/v1/services/srv-d5ujf84hg0os73av0cbg/deploys?limit=3" \
  -H "Authorization: Bearer rnd_jrQm9OihMBbQ1VYQMEBw1keynwVq"
```

### Service ID
- **owl-backend**: srv-d5ujf84hg0os73av0cbg

## Architecture
- Frontend: Next.js on Vercel
- Backend: Express + WebSocket on Render
- Sandbox: E2B (Firecracker microVMs)
- AI: Claude Sonnet for code generation
