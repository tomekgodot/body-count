# Body Count PWA prototype

Local-first prototype. No backend, no account, no analytics. Data is stored in IndexedDB in the browser on the current device.

## Run locally
Because service workers require http(s), run a local server from this folder, for example:

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

## Current flow
Home → Add to the Count → optional detail categories → person profile / collection.
