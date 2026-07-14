# ctms-core on DigitalOcean (single VM)

Provisions one droplet running the production stack
(`infra/compose.prod.yaml`) via `infra/cloud-init.yaml` — Terraform never
duplicates install logic (ADR-0032). Same variable contract as the `../aws`
and `../azure` roots. Authenticate with `DIGITALOCEAN_TOKEN` in the
environment.

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
`ssh root@<ip> cloud-init status --wait`. The pilot checklist in
`docs/05-deployment.md` still applies from there: IdP client registration,
TMF RM import, first-admin provisioning, `pnpm validation:iq` sign-off.

What you get: Ubuntu 24.04 on `s-1vcpu-2gb` (~$12/mo), a cloud firewall
exposing only 80/443 (SSH restricted to `admin_cidr`), and a reserved IP.
`root_volume_gb` is ignored here — the disk comes with the size slug.

**WORM storage is not provisioned here.** DigitalOcean Spaces has no Object
Lock; documents land on the encrypted droplet volume unless you bring an
S3-compatible bucket that supports it (the `../aws` root creates one) via
`extra_env` — see `docs/05-deployment.md` for the posture discussion.

State is local (`terraform.tfstate` — it contains the generated database
passwords; treat it as a secret). For team use, add one of the standard
remote backends in `versions.tf`.
