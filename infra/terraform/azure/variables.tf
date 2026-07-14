# The same variable contract as ../aws and ../digitalocean (ADR-0032).

variable "name" {
  description = "Resource name prefix"
  type        = string
  default     = "ctms-core"
}

variable "region" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "instance_size" {
  description = "VM size (the stack is light; B2s has ample headroom)"
  type        = string
  default     = "Standard_B2s"
}

variable "ssh_public_key" {
  description = "SSH public key material for the admin user"
  type        = string
}

variable "admin_cidr" {
  description = "CIDR allowed to reach SSH (e.g. your office or VPN range — never 0.0.0.0/0)"
  type        = string
}

variable "domain" {
  description = "Hostname the stack serves; point its DNS A record at the public_ip output"
  type        = string
}

variable "app_version" {
  description = "Released ctms-core version to run (git tag without the leading v)"
  type        = string
}

variable "auth_mode" {
  description = "dev (static demo tokens) or oidc (any real deployment)"
  type        = string
  default     = "oidc"
}

variable "root_volume_gb" {
  description = "OS disk size in GB (Postgres and the local document store); server-side encrypted by the platform"
  type        = number
  default     = 50
}

variable "compose_profiles" {
  description = "COMPOSE_PROFILES for the stack: local-db = bundled Postgres, s3-local = bundled MinIO"
  type        = string
  default     = "local-db"
}

variable "extra_env" {
  description = "Additional .env lines (OIDC issuer/audience, managed DATABASE_URL, S3 storage, digest SMTP — see infra/.env.example), newline-separated"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
