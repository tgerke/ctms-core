# One droplet running infra/compose.prod.yaml (ADR-0032). All app
# installation is delegated to infra/cloud-init.yaml — this root only
# provisions the machine, its firewall, and a stable address. Droplet disks
# are encrypted at rest by the platform.
#
# WORM object storage is not provisioned here: DigitalOcean Spaces has no
# Object Lock — bring an S3-compatible bucket that does (the ../aws root
# creates one) or accept the local document volume for non-WORM pilots.

provider "digitalocean" {}

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "ctms_app" {
  length  = 32
  special = false
}

resource "digitalocean_ssh_key" "admin" {
  name       = "${var.name}-admin"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "host" {
  name     = var.name
  region   = var.region
  size     = var.instance_size
  image    = "ubuntu-24-04-x64"
  ssh_keys = [digitalocean_ssh_key.admin.fingerprint]
  tags     = var.tags

  user_data = templatefile("${path.module}/../../cloud-init.yaml", {
    domain            = var.domain
    app_version       = var.app_version
    auth_mode         = var.auth_mode
    postgres_password = random_password.postgres.result
    ctms_app_password = random_password.ctms_app.result
    compose_profiles  = var.compose_profiles
    extra_env         = indent(6, var.extra_env)
  })
}

resource "digitalocean_reserved_ip" "host" {
  region = var.region
}

resource "digitalocean_reserved_ip_assignment" "host" {
  ip_address = digitalocean_reserved_ip.host.ip_address
  droplet_id = digitalocean_droplet.host.id
}

resource "digitalocean_firewall" "host" {
  name        = var.name
  droplet_ids = [digitalocean_droplet.host.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = [var.admin_cidr]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "udp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
