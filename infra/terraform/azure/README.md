# ctms-core on Azure (single VM)

Provisions one VM running the production stack (`infra/compose.prod.yaml`)
via `infra/cloud-init.yaml` — Terraform never duplicates install logic
(ADR-0031). Same variable contract as the `../aws` and `../digitalocean`
roots. Authenticate with `az login` (or a service principal).

```sh
terraform init
terraform apply \
  -var ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)" \
  -var admin_cidr="203.0.113.7/32" \
  -var domain="ctms.example.org" \
  -var app_version="0.1.0" \
  -var extra_env="OIDC_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0
OIDC_AUDIENCE=ctms-api"
```

Then point the domain's A record at the `public_ip` output; Caddy obtains
the TLS certificate on its own. Watch first boot with
`ssh ubuntu@<ip> cloud-init status --wait`. The pilot checklist in
`docs/05-deployment.md` still applies from there: IdP client registration
(Entra ID works with the standard flows), TMF RM import, first-admin
provisioning, `pnpm validation:iq` sign-off.

What you get: Ubuntu 24.04 LTS on `Standard_B2s` in its own resource group,
a platform-encrypted Premium SSD OS disk, an NSG exposing only 80/443 (SSH
restricted to `admin_cidr`), and a static public IP.

**WORM storage is not provisioned here.** Documents land on the encrypted
VM volume unless you bring an S3-compatible Object Lock bucket (the
`../aws` root creates one) via `extra_env` — see `infra/.env.example` and
`docs/05-deployment.md` for the posture discussion.

State is local (`terraform.tfstate` — it contains the generated database
passwords; treat it as a secret). For team use, add one of the standard
remote backends in `versions.tf`.
