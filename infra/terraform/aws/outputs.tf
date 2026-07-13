output "public_ip" {
  description = "Static address to point the domain's A record at"
  value       = aws_eip.host.public_ip
}

output "ssh_command" {
  value = "ssh ubuntu@${aws_eip.host.public_ip}"
}

output "dns_instructions" {
  value = "Create an A record: ${var.domain} -> ${aws_eip.host.public_ip}. Caddy obtains TLS automatically once it resolves."
}

output "documents_bucket" {
  description = "WORM document bucket (empty when create_object_lock_bucket=false)"
  value       = var.create_object_lock_bucket ? aws_s3_bucket.documents[0].bucket : ""
}
