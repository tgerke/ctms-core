# ctms-core on AWS (single VM + Object Lock bucket)

Provisions one EC2 instance running the production stack
(`infra/compose.prod.yaml`) via `infra/cloud-init.yaml`, plus the WORM
document bucket the pilot posture calls for (`docs/05-deployment.md`,
ADR-0009): S3 with Object Lock enabled at creation, versioning, a
COMPLIANCE default-retention rule, and a least-privilege IAM principal
(put/get/list — no delete). Terraform never duplicates install logic
(ADR-0032); same variable contract as the `../azure` and `../digitalocean`
roots.

```sh
terraform init
terraform apply \
  -var ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)" \
  -var admin_cidr="203.0.113.7/32" \
  -var domain="ctms.example.org" \
  -var app_version="0.1.0" \
  -var extra_env="OIDC_ISSUER=https://idp.example.org/realms/main
OIDC_AUDIENCE=ctms-api"
```

Then point the domain's A record at the `public_ip` output; Caddy obtains
the TLS certificate on its own. Watch first boot with
`ssh ubuntu@<ip> cloud-init status --wait`. The pilot checklist in
`docs/05-deployment.md` still applies from there: IdP client registration,
TMF RM import, first-admin provisioning, `pnpm validation:iq` sign-off.

**Object Lock is real.** A locked version cannot be deleted before its
retention expires — by anyone, including the account root — and
`terraform destroy` cannot remove a non-empty locked bucket. That is the
point in production; for throwaway experiments set
`-var create_object_lock_bucket=false` (documents then land on the
encrypted VM volume) or a small `-var object_lock_retention_days=1`.

`AUTH_MODE` defaults to `oidc`, which needs `OIDC_ISSUER`/`OIDC_AUDIENCE`
via `extra_env` as above (or edit `/opt/ctms/.env` on the host afterwards
and `docker compose -f compose.prod.yaml up -d`). `-var auth_mode=dev` is
demo-only.

State is local (`terraform.tfstate` — it contains the generated database
passwords and the S3 secret key; treat it as a secret). For team use, add
one of the standard remote backends in `versions.tf`.
