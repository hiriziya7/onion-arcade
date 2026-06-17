This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## OnionDAO wallet

The arcade can optionally integrate with OnionDAO so players use real OnionDAO
usernames and top up their balance from the OnionDAO escrow. With **no**
OnionDAO env set, the arcade still works fully: identity falls back to the local
`@id` flow and the 5-onion paywall spends local welcome onions.

When OnionDAO **is** configured, new players start with **0 onions** (no welcome
grant) and must top up from their OnionDAO wallet before playing — the paywall
spends real, deposited onions.

### Setup

1. Copy `.env.example` to `.env.local` and fill in `ONION_API_BASE` and
   `ONION_EXTERNAL_API_KEY` (all OnionDAO vars are server-only — never
   `NEXT_PUBLIC_`).
2. Create the app's escrow wallet:

   ```bash
   node scripts/onion-setup.mjs
   # or, to also register the callback safety net (recommended in prod):
   ONION_CALLBACK_URL=https://<host>/api/onions/escrow-callback \
     node scripts/onion-setup.mjs
   ```

   Paste the printed `ONION_ESCROW_ACCOUNT_ID`, `ONION_ESCROW_ACCOUNT_SECRET`
   (and `ONION_CALLBACK_SECRET`, if a callback URL was given) into `.env.local`.
   The secrets are shown only once. The callback URL is fixed at creation.
3. Set `ARCADE_ADMIN_SECRET` (guards the payout route) and optionally
   `GAME_COST` (defaults to 5).
4. Restart the dev server.

### Flow

1. **Identity** — player claims an OnionDAO username
   (`POST /api/onions/claim`); validated against OnionDAO and held uniquely.
2. **Deposit** — player tops up onions into escrow
   (`POST /api/onions/deposit`), then the status is polled
   (`GET /api/onions/deposit?depositId=`). The local balance is credited exactly
   once (atomically), whichever arrives first — the poll or the signed escrow
   callback (`POST /api/onions/escrow-callback`).
3. **Play** — each game spends `GAME_COST` onions
   (`POST /api/onions/spend`); insufficient balance returns 402.
4. **Payout** — admins transfer prizes back to a user
   (`POST /api/onions/payout`, requires `x-admin-secret`).
