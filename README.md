	# AdapNow (Rework) — Cloudflare Workers Rebuild
     	
     	**Repo:** `adapnow-rework-02-03-2026`  
     	**Primary domain:** `adapnow.com`  
     	**Runtime:** Cloudflare Workers (OpenNext)  
     	**Framework:** Next.js (App Router)
     	
     	This repository is a full rebuild of the AdapNow application to deploy cleanly and reliably on **Cloudflare Workers**, using the **OpenNext for Cloudflare** stack.
     	
    	The goal of this rebuild is:
    	- Correct Cloudflare-native deployment (Workers, not legacy server hosting)
    	- Clean DNS + Worker routing (no “ghost configs”)
    	- Production-ready build pipeline
    	- Strong performance, caching, security, and SEO
    	
    	---
    	
    	## Table of Contents
    	
    	- [Project Goals](#project-goals)
    	- [Stack](#stack)
    	- [Architecture Overview](#architecture-overview)
    	- [Local Development](#local-development)
    	- [Deploying to Cloudflare Workers](#deploying-to-cloudflare-workers)
    	- [Domain + DNS Configuration](#domain--dns-configuration)
    	- [Environment Variables](#environment-variables)
    	- [SEO: robots.txt + sitemap](#seo-robotstxt--sitemap)
    	- [Recommended Cloudflare Settings](#recommended-cloudflare-settings)
    	- [Scripts](#scripts)
    	- [Troubleshooting](#troubleshooting)
    	- [Roadmap](#roadmap)
    	- [License](#license)
    	
    	---
    	
    	## Project Goals
    	
    	This rebuild exists to fix and improve the following categories of issues:
    	
    	### ✅ 1) Deployment correctness
    	- Workers (edge runtime) is the source of truth
    	- Removes dependence on server IP hosting
    	- No “Pages vs Workers” confusion
    	
    	### ✅ 2) Domain integrity
    	- Avoid leftover routing/rules and conflicting custom domains
    	- Avoid old origin IP fallback problems
    	
    	### ✅ 3) Production stability
    	- Clear environments: dev vs prod
    	- Stable build commands
    	- Consistent worker routing patterns
    	
    	### ✅ 4) SEO + crawlers
    	- Crawlable content
    	- Image crawl support
    	- Correct robots and sitemap configuration
    	
    	---
    	
    	## Stack
    	
    	### Core
    	- **Next.js** (App Router)
    	- **TypeScript** (recommended)
    	- **Cloudflare Workers** runtime
    	
    	### Deployment
    	- **OpenNext for Cloudflare**
    	- **Wrangler**
    	- **Cloudflare DNS / SSL / Routing**
    	- GitHub repository connected to Cloudflare build
    	
    	---
    	
    	## Architecture Overview
    	
    	High-level request flow:
    	
    	1. Visitor requests `https://adapnow.com/...`
    	2. Cloudflare DNS resolves and routes to Cloudflare edge
    	3. Worker route matches `adapnow.com/*`
    	4. Cloudflare Worker executes
    	5. OpenNext serves the Next.js application (SSR/ISR/static handling depending on route)
    	
    	### Request flow
    	
    	Browser
    	↓
    	Cloudflare DNS (adapnow.com)
    	↓
    	Cloudflare Edge
    	↓
    	Workers Route (adapnow.com/*)
    	↓
    	Worker: adapnow-rework
    	↓
    	OpenNext runtime
    	↓
   	Next.js App Router pages
   	
   	---
   	
   	## Local Development
   	
   	### Requirements
   	- Node.js **20 LTS** recommended (avoid edge/beta Node versions)
   	- pnpm (or npm)
   	- Git
   	
   	Check versions:
   	
   	```bash
   	node -v
   	pnpm -v
   	git --version
   	```
   	
   	Install dependencies:
   	
   	```bash
   	pnpm install
   	```
   	
   	Run the app locally:
   	
   	```bash
   	pnpm dev
   	```
   	
   	By default Next.js runs on:
   	
   	```
   	http://localhost:3000
   	```
   	
   	---
   	
   	## Deploying to Cloudflare Workers
   	
   	This project uses OpenNext to build a Worker bundle and deploy it.
   	
   	### Build for Cloudflare
   	
   	```bash
   	pnpm build
   	```
   	
   	Typical build does:
   	
   	```
   	next build
   	@opennextjs/cloudflare build
   	```
   	
   	### Deploy to Cloudflare
   	
   	```bash
   	pnpm deploy
   	```
   	
   	Or directly:
   	
   	```bash
   	pnpm exec wrangler deploy
   	```
   	
   	---
   	
   	## Domain + DNS Configuration
   	
   	### Domain
   	
   	`adapnow.com` is configured to route to the Worker.
   	
   	`www.adapnow.com` is configured as an alias to the apex domain.
   	
   	### Workers routing
   	
   	Cloudflare dashboard must include routes like:
   	
   	```
   	adapnow.com/* → Worker adapnow-rework
   	www.adapnow.com/* → Worker adapnow-rework
   	```
   	
   	### DNS
   	
   	When using Workers with custom domains, Cloudflare will often manage the apex record automatically:
   	
   	```
   	Worker adapnow.com → adapnow-rework (Proxied)
   	```
   	
   	`www` typically should be:
   	
   	```
   	CNAME www → adapnow.com (Proxied)
   	```
   	
   	---
   	
   	## Environment Variables
   	
   	Environment variables are stored in:
   	
   	- `.env.local` (local development only)
   	- Cloudflare Worker secrets for production
   	
   	### Local (`.env.local`)
   	
   	Create:
   	
   	```bash
   	cp .env.example .env.local
   	```
   	
   	### Production secrets
   	
   	Set secrets using Wrangler:
   	
   	```bash
   	pnpm exec wrangler secret put SOME_SECRET
   	```
   	
   	---
   	
   	## SEO: robots.txt + sitemap
   	
   	### robots.txt
   	
   	A production-safe robots file should:
   	
   	- allow search engines
   	- block admin/auth/cart/checkout
   	- allow image crawling
   	
   	Example path:
   	
   	```
   	public/robots.txt
   	```
   	
   	### sitemap.xml
   	
   	Recommended:
   	
   	```
   	https://adapnow.com/sitemap.xml
   	```
   	
   	---
   	
   	## Recommended Cloudflare Settings
   	
   	### SSL/TLS
   	
   	Recommended:
   	
   	- SSL/TLS mode: Full (strict)
     - Always Use HTTPS: ON
   	- Automatic HTTPS Rewrites: ON
   	
   	### Caching
   	
   	Recommended:
   	
   	- Cache static assets aggressively
   	- Do not cache authenticated pages
   	- Use Cache-Control headers
   	
   	---
   	
   	## Scripts
   	
   	Common commands:
   	
   	| Command | Description |
   	| --- | --- |
   	| pnpm dev | Start local dev server |
   	| pnpm build | Build Next + OpenNext worker bundle |
   	| pnpm deploy | Deploy worker to Cloudflare |
   	| pnpm lint | Lint |
   	| pnpm typecheck | TypeScript checks |
   	
   	---
   	
   	## Troubleshooting
   	
   	TBD
   	
   	---
   	
   	## Roadmap
   	
   	 Build production homepage + marketing copy

      - Authentication + account system
     
      - User dashboard

      - Admin tooling

      - Analytics and event tracking

      - SEO expansion + content pages

      - A/B testing and performance monitoring


   	
   	---
   	
   	## License
   	
   	 — all rights reserved.
