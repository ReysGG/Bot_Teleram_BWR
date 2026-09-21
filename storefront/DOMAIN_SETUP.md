# Custom domain setup — store.buildwithreys.com

Owner requested this domain and explicitly approved the Freestyle ownership TXT
and certificate-challenge NS records on 2026-09-15. DomaiNesia login and email OTP
were completed through the browser. No credentials or OTP are stored here.

## DNS records saved and verified in the registrar UI

| Relative name | Type | Destination | TTL |
| --- | --- | --- | --- |
| store | CNAME | beta-web.freestyle.sh | 300 |
| _freestyle_custom_hostname.store | TXT | Freestyle-issued challenge, retained in provider UI | 300 |
| _acme-challenge.store | NS | beta-dns.freestyle.sh | 300 |

The existing mail A record and root MX record were preserved. Root nameservers
remain srx1/srx2/srx3/srx4.domainesia.com.

Freestyle verification ID: `dv-005210a3d0d04dbeab7a03d17a2c47bf`.
Team: `acct-d50be7ba22a940eba76856e16add81ad`.
VM: `vm-a6fa78d4cf43495dabed6f7545c972da`, app port 3000.

## Activation progress

All three DNS records now resolve. Freestyle ownership verification completed at
2026-09-15 14:49:58 UTC. TLS ingress rule `tls-8771536a24d74853bccbbe72c4ca0aed`
was created for this exact hostname, public to the frontend VM port 3000.

Public HTTPS is now active with a trusted non-wildcard certificate, generation
144, expiring 2026-12-14T23:59:59Z. Initial certificate errors resolved after
issuance completed; no certificate validation was bypassed.

The domain environment script completed successfully. APP_URL is now
https://store.buildwithreys.com; it was the only changed environment key. Private
backup: `/opt/telegram-storefront-freestyle/backups/20260915-custom-domain/.env.production`.
The storefront container is healthy. Public /api/health, /shop, /sign-in and
/cart returned HTTP 200; checkout POST remains 503 preview_read_only.
Chrome successfully opened the real catalog on the custom HTTPS domain.

The working link was sent via WhatsApp Desktop to David Boy (You), with a clear
note that checkout and Clerk production activation remain unfinished. The sent
message was verified in the conversation with two check marks.

Completed activation procedure (reference only; do not rerun blindly):

1. Complete the existing Freestyle verification by ID.
2. Create a TLS ingress rule for store.buildwithreys.com from public to this VM,
   port 3000. If the CLI returns an internal error, inspect existing rules before
   retrying creation (the mutation may already have succeeded).
3. Verify HTTPS without bypassing certificate checks, including /api/health,
   /shop and /sign-in.
4. Run `/tmp/storefront-domain-activate.py` on the Freestyle VM. Its local source
   is `../deploy/storefront-domain-activate.py`. It first requires working HTTPS,
   saves a private environment backup, changes only APP_URL, recreates only the
   storefront app, verifies health, and rolls back the environment on failure.
5. Verify the public site in Chrome. Send the working link to the owner's
   WhatsApp self-chat David Boy (You), as explicitly requested.

The previous URL remains https://bwr-tele-a6fa78d4.style.dev.
Clerk production and the separately approved cart migration were subsequently
completed; checkout is now open. See `COMMERCE_ACTIVATION_RESULT.md` for current
state. No Telegram/Azure or production database changes were made during the
earlier DNS-only setup.
