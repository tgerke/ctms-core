# The same variable contract as ../azure and ../digitalocean (ADR-0032),
# plus the Object Lock bucket controls that only AWS carries.

variable "name" {
  description = "Resource name prefix"
  type        = string
  default     = "ctms-core"
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "instance_size" {
  description = "EC2 instance type (2 vCPU / 2 GB runs the stack comfortably)"
  type        = string
  default     = "t3a.small"
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
  description = "Root disk size in GB (Postgres, and documents when the bucket is off); always encrypted"
  type        = number
  default     = 50
}

variable "compose_profiles" {
  description = "COMPOSE_PROFILES for the stack: local-db = bundled Postgres, s3-local = bundled MinIO"
  type        = string
  default     = "local-db"
}

variable "extra_env" {
  description = "Additional .env lines (OIDC issuer/audience, managed DATABASE_URL, digest SMTP — see infra/.env.example), newline-separated"
  type        = string
  default     = ""
}

variable "create_object_lock_bucket" {
  description = "Create the WORM document bucket (S3 Object Lock, COMPLIANCE mode) and wire the stack to it. The pilot posture; turn off only for throwaway experiments."
  type        = bool
  default     = true
}

variable "object_lock_retention_days" {
  description = "Default COMPLIANCE retention. Nothing — not even the root account — can delete a locked version before it expires; match your records-retention schedule, and keep it small for experiments."
  type        = number
  default     = 3650
}

variable "tags" {
  description = "Tags applied to every resource"
  type        = map(string)
  default     = {}
}
