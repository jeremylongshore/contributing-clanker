# Installing Claude Code on Your Mac

Hi Shelly! This guide will walk you through installing Claude Code step by step. Don't worry if you've never used the command line before - I'll explain everything.

---

## What You're Installing

Claude Code is an AI coding assistant that runs in your Terminal. It can help you write code, fix bugs, and build projects.

---

## Step 1: Open Terminal

1. Press **Command + Space** on your keyboard (opens Spotlight)
2. Type **Terminal**
3. Press **Enter**

A window with a black or white background will open. This is where you'll type commands.

---

## Step 2: Check if Node.js is Installed

Copy and paste this into Terminal, then press **Enter**:

```
node --version
```

**If you see a number like `v18.0.0` or higher** → Skip to Step 4

**If you see "command not found"** → Continue to Step 3

---

## Step 3: Install Node.js

### Option A: Download from Website (Easiest)

1. Go to: **https://nodejs.org**
2. Click the big green button that says **"LTS"** (recommended)
3. Open the downloaded file
4. Follow the installer prompts (just click Continue/Next)
5. When done, **close Terminal and reopen it** (important!)
6. Go back to Step 2 to verify it worked

### Option B: Using Homebrew (if you have it)

```
brew install node
```

---

## Step 4: Install Claude Code

Copy and paste this into Terminal, then press **Enter**:

```
npm install -g @anthropic-ai/claude-code
```

Wait for it to finish (might take a minute). You'll see some text scrolling by - that's normal.

---

## Step 5: Sign In to Claude

Type this and press **Enter**:

```
claude
```

Your web browser will open automatically. Sign in with your Anthropic account (or create one if you don't have one).

---

## Step 6: You're Done!

After signing in, you're ready to use Claude Code!

### To start Claude Code anytime:

1. Open Terminal
2. Type `claude` and press Enter

### To use it in a project folder:

1. Open Terminal
2. Navigate to your project (see below)
3. Type `claude` and press Enter

---

## How to Navigate to a Folder

If your project is on your Desktop in a folder called "my-project":

```
cd ~/Desktop/my-project
```

Then type `claude` to start.

---

## Helpful Commands Inside Claude Code

| What to Type | What It Does |
|--------------|--------------|
| `/help` | Shows all available commands |
| `/clear` | Clears the conversation |
| **Ctrl + C** | Stops Claude / Exits |

---

## Common Problems & Fixes

### "Permission denied" error

Run this instead:
```
sudo npm install -g @anthropic-ai/claude-code
```
It will ask for your Mac password. Type it (you won't see the characters - that's normal) and press Enter.

### "node: command not found"

Node.js isn't installed. Go back to Step 3.

### Browser didn't open for sign-in

1. Type `claude logout` and press Enter
2. Type `claude` again

---

## Need Help?

- Anthropic docs: https://docs.anthropic.com/claude-code
- Report issues: https://github.com/anthropics/claude-code/issues

---

*You've got this, Shelly!* 🎉
