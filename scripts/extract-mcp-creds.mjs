#!/usr/bin/env node
/**
 * Reads the OAuth credentials mcp-remote saved after authenticating with
 * the Canva MCP server, and prints the three env-var values you need to
 * paste into Vercel.
 *
 * Usage:
 *   1. npx mcp-remote@latest https://mcp.canva.com/mcp   (authorize once)
 *   2. node scripts/extract-mcp-creds.mjs                (print creds)
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

async function main() {
  const baseDir = process.env.MCP_REMOTE_CONFIG_DIR ?? join(homedir(), '.mcp-auth');

  // Find all versioned mcp-remote directories, newest first
  let entries;
  try {
    entries = await readdir(baseDir);
  } catch {
    die(
      `Directory ${baseDir} not found.\n` +
        'Run:  npx mcp-remote@latest https://mcp.canva.com/mcp\n' +
        'Then authorize in the browser, then re-run this script.'
    );
  }

  const mcpDirs = entries
    .filter((e) => e.startsWith('mcp-remote-'))
    .map((e) => join(baseDir, e))
    .sort()
    .reverse();

  if (!mcpDirs.length) {
    die('No mcp-remote config directory found. Run mcp-remote first.');
  }

  // Scan all versioned dirs for client_info files
  const found = [];
  for (const dir of mcpDirs) {
    let files;
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('_client_info.json')) continue;
      const hash = file.replace('_client_info.json', '');
      const tokensFile = join(dir, `${hash}_tokens.json`);
      try {
        const [clientRaw, tokensRaw] = await Promise.all([
          readFile(join(dir, file), 'utf8'),
          readFile(tokensFile, 'utf8'),
        ]);
        const clientInfo = JSON.parse(clientRaw);
        const tokens = JSON.parse(tokensRaw);
        const mtimeResult = await stat(join(dir, file));
        found.push({ clientInfo, tokens, mtime: mtimeResult.mtimeMs, hash, dir });
      } catch {
        // skip incomplete sets
      }
    }
  }

  if (!found.length) {
    die(
      'No complete OAuth credential files found.\n' +
        'Make sure mcp-remote finished the authorization flow:\n' +
        '  npx mcp-remote@latest https://mcp.canva.com/mcp'
    );
  }

  // Sort by newest first
  found.sort((a, b) => b.mtime - a.mtime);

  if (found.length > 1) {
    console.log(`Found ${found.length} credential set(s). Using the most recent.\n`);
  }

  const { clientInfo, tokens } = found[0];

  const clientId     = clientInfo.client_id;
  const clientSecret = clientInfo.client_secret;
  const refreshToken = tokens.refresh_token;

  if (!clientId || !clientSecret || !refreshToken) {
    die(
      'Credential files are incomplete. Try re-running:\n' +
        '  npx mcp-remote@latest https://mcp.canva.com/mcp'
    );
  }

  console.log('='.repeat(60));
  console.log('  Canva MCP credentials — paste into Vercel env vars');
  console.log('='.repeat(60));
  console.log();
  console.log(`CANVA_MCP_CLIENT_ID=${clientId}`);
  console.log(`CANVA_MCP_CLIENT_SECRET=${clientSecret}`);
  console.log(`CANVA_MCP_REFRESH_TOKEN=${refreshToken}`);
  console.log();
  console.log('='.repeat(60));
  console.log('In Vercel → Settings → Environment Variables, add all three.');
  console.log('Redeploy after adding them.');
}

function die(msg) {
  console.error('\nError:', msg);
  process.exit(1);
}

main();
