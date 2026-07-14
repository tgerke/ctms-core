# WORM document storage (ADR-0009): the bucket is created WITH Object Lock —
# it cannot be retrofitted — plus versioning (required by Object Lock) and a
# COMPLIANCE-mode default retention rule. A locked version cannot be deleted
# by anyone, including the root account, until retention expires; that is the
# storage-level analogue of the database's ctms_forbid_mutation().
#
# Consequence for experiments: `terraform destroy` cannot remove a bucket
# holding locked objects. Use create_object_lock_bucket=false (or a small
# object_lock_retention_days) for anything you intend to tear down.

resource "aws_s3_bucket" "documents" {
  count = var.create_object_lock_bucket ? 1 : 0

  bucket_prefix       = "${var.name}-documents-"
  object_lock_enabled = true
  tags                = var.tags
}

resource "aws_s3_bucket_versioning" "documents" {
  count = var.create_object_lock_bucket ? 1 : 0

  bucket = aws_s3_bucket.documents[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "documents" {
  count = var.create_object_lock_bucket ? 1 : 0

  bucket = aws_s3_bucket.documents[0].id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = var.object_lock_retention_days
    }
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  count = var.create_object_lock_bucket ? 1 : 0

  bucket                  = aws_s3_bucket.documents[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Minimal principal for the api's storage driver: object read/write and
# bucket listing, nothing else — no delete, no lock administration.
resource "aws_iam_user" "app" {
  count = var.create_object_lock_bucket ? 1 : 0

  name = "${var.name}-app"
  tags = var.tags
}

resource "aws_iam_user_policy" "app" {
  count = var.create_object_lock_bucket ? 1 : 0

  name = "${var.name}-documents"
  user = aws_iam_user.app[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.documents[0].arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = aws_s3_bucket.documents[0].arn
      },
    ]
  })
}

resource "aws_iam_access_key" "app" {
  count = var.create_object_lock_bucket ? 1 : 0

  user = aws_iam_user.app[0].name
}
