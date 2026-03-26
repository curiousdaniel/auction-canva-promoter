# Canva Apps SDK Setup (What We Did)

This document records how we scaffolded a Canva app using the Canva Apps SDK Quickstart, so the rest of this repo can continue from the same setup knowledge.

Reference: [Canva Apps SDK Quickstart](https://www.canva.dev/docs/apps/quickstart/)

## What we created
We used the Canva CLI to create a new Canva app scaffold (starter kit) using:
- a template such as `hello_world`
- `public` distribution (if you need team-only, use `private` instead)

The scaffold created an app folder under the directory you ran the command from (example: `my-new-app/`).

## Prerequisites
- Node.js `v24`
- npm `v11`
- `git`
- Canva account

## CLI install issue (macOS permissions)
If `npm install -g @canva/cli@latest` fails with `EACCES ... /usr/local/lib/node_modules/...`, use a user-local global prefix:

```sh
mkdir -p "$HOME/.npm-global"
npm config set prefix "$HOME/.npm-global"
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

npm install -g @canva/cli@latest
```

Then verify:
```sh
which canva
canva --help
```

## Create the app
From the folder where you want the scaffold created:

```sh
canva apps create "My New App" --template="hello_world" --distribution="public" --git --installDependencies
```

The CLI may show an interactive “optional configs” step; we proceeded to the next step until the app was created successfully.

## Run locally
```sh
cd my-new-app
npm start
```

Expected dev server:
- `http://localhost:8080`

## Preview in Canva (Developer Portal)
You generally do NOT preview by opening `http://localhost:8080` in your browser directly.

Instead, in the Canva Developer Portal for your app:
1. Go to **Code upload**
2. Under **App source**, choose **Development URL**
3. Set **Development URL** to the dev server URL (typically `http://localhost:8080/`)
4. Click **Preview**
5. Click **Open** if it is your first time previewing

## Environment variables
The scaffold includes `my-new-app/.env` and `my-new-app/.env.template`.

In the successful scaffold we did, the Canva-related values were filled in automatically (so you usually do not need to manually set them right away).

If you ever see placeholders like `# TODO` in `my-new-app/.env`, copy the values from the Developer Portal:
- **Settings** -> **Security** -> **Credentials** -> **.env file**
- Paste those contents into `my-new-app/.env`
- Restart:
  ```sh
  npm start
  ```

Note: do not commit `my-new-app/.env` to git.

## Backend note (only if the template includes one)
If the selected template provides an example backend, it typically runs on:
- `http://localhost:3001`

