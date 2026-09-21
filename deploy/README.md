# Azure production deployment

This directory is copied to `/opt/telegram-store` on the VM. Current builds run
on a separate build VM, per the operator's instruction, and backend images are
transferred with `docker save`/`docker load`. The production database host is
not used as the storefront host.

For the reusable storefront deployment commands (SSH or Freestyle), see
[`template/README.md`](template/README.md). Domain, TLS, and Clerk setup are in
[`template/DOMAIN_SETUP.md`](template/DOMAIN_SETUP.md).

The public endpoint is `https://70-153-137-10.sslip.io`. Caddy obtains and
renews its TLS certificate automatically. PostgreSQL is reachable only on the
internal Compose network.

Before starting the stack, place the production secrets in
`/opt/telegram-store/.env.production` and load these image tags:

```text
telegram-app:production
telegram-migrate:production
```

The VM should expose only TCP 22, TCP 80, TCP 443, and UDP 443. Do not expose
port 3000 or 5432.
