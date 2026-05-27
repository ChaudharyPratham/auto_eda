"""
Cloud Storage Service
=====================
Downloads a single file OR a folder/prefix from Azure Blob Storage, AWS S3,
GCP Cloud Storage, or Databricks DBFS and returns local path(s) for processing.

All providers are optional – missing SDK packages are caught at call time with
a clear error message so the server boots fine without any cloud SDK installed.

Supported URI formats:
  Azure      https://<account>.blob.core.windows.net/<container>/<blob-or-prefix>
             az://<container>/<blob-or-prefix>
  AWS S3     s3://<bucket>/<key-or-prefix>
  GCP GCS    gs://<bucket>/<object-or-prefix>
  Databricks dbfs://<path>   or   /Volumes/<catalog>/<schema>/<volume>/<path>
"""

import os
import re
import uuid
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _dest_path(download_dir: str, filename: str) -> str:
    ext = Path(filename).suffix or ".bin"
    fid = str(uuid.uuid4())
    os.makedirs(download_dir, exist_ok=True)
    return os.path.join(download_dir, f"{fid}{ext}"), fid


# ══════════════════════════════════════════════════════════════════════════════
# Azure Blob Storage
# ══════════════════════════════════════════════════════════════════════════════

def download_azure(container: str, blob: str, download_dir: str) -> tuple[str, str]:
    """
    Download a blob using env credentials.
    Priority: AZURE_STORAGE_CONNECTION_STRING > account name + key.
    """
    try:
        from azure.storage.blob import BlobServiceClient
    except ImportError:
        raise RuntimeError("azure-storage-blob is not installed. Run: pip install azure-storage-blob")

    conn_str  = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "").strip()
    acct_name = os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "").strip()
    acct_key  = os.getenv("AZURE_STORAGE_ACCOUNT_KEY", "").strip()

    if conn_str:
        client = BlobServiceClient.from_connection_string(conn_str)
    elif acct_name and acct_key:
        url = f"https://{acct_name}.blob.core.windows.net"
        client = BlobServiceClient(account_url=url, credential=acct_key)
    else:
        raise ValueError("Set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY in .env")

    path, fid = _dest_path(download_dir, blob.split("/")[-1])
    blob_client = client.get_blob_client(container=container, blob=blob)
    with open(path, "wb") as fh:
        stream = blob_client.download_blob()
        stream.readinto(fh)
    logger.info("Azure: downloaded %s/%s → %s", container, blob, path)
    return path, fid


# ══════════════════════════════════════════════════════════════════════════════
# AWS S3
# ══════════════════════════════════════════════════════════════════════════════

def download_s3(bucket: str, key: str, download_dir: str) -> tuple[str, str]:
    try:
        import boto3
    except ImportError:
        raise RuntimeError("boto3 is not installed. Run: pip install boto3")

    kwargs: dict = {}
    region = os.getenv("AWS_REGION", "").strip()
    if region:
        kwargs["region_name"] = region

    access_key = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
    secret_key  = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
    if access_key and secret_key:
        kwargs.update(aws_access_key_id=access_key, aws_secret_access_key=secret_key)

    s3 = boto3.client("s3", **kwargs)
    path, fid = _dest_path(download_dir, key.split("/")[-1])
    s3.download_file(bucket, key, path)
    logger.info("S3: downloaded s3://%s/%s → %s", bucket, key, path)
    return path, fid


# ══════════════════════════════════════════════════════════════════════════════
# Google Cloud Storage
# ══════════════════════════════════════════════════════════════════════════════

def download_gcs(bucket: str, blob_name: str, download_dir: str) -> tuple[str, str]:
    try:
        from google.cloud import storage as gcs
    except ImportError:
        raise RuntimeError("google-cloud-storage is not installed. Run: pip install google-cloud-storage")

    creds_json = os.getenv("GCP_CREDENTIALS_JSON", "").strip()
    project    = os.getenv("GCP_PROJECT_ID", "").strip() or None

    if creds_json:
        from google.oauth2 import service_account
        creds = service_account.Credentials.from_service_account_file(creds_json)
        client = gcs.Client(project=project, credentials=creds)
    else:
        client = gcs.Client(project=project)  # uses ADC

    path, fid = _dest_path(download_dir, blob_name.split("/")[-1])
    bucket_obj = client.bucket(bucket)
    blob_obj   = bucket_obj.blob(blob_name)
    blob_obj.download_to_filename(path)
    logger.info("GCS: downloaded gs://%s/%s → %s", bucket, blob_name, path)
    return path, fid


# ══════════════════════════════════════════════════════════════════════════════
# Databricks (DBFS or Unity Catalog Volume)
# ══════════════════════════════════════════════════════════════════════════════

def download_databricks(remote_path: str, download_dir: str) -> tuple[str, str]:
    """
    remote_path examples:
      dbfs:/FileStore/datasets/sales.csv
      /Volumes/catalog/schema/volume/sales.parquet
    """
    try:
        from databricks.sdk import WorkspaceClient
    except ImportError:
        raise RuntimeError("databricks-sdk is not installed. Run: pip install databricks-sdk")

    host  = os.getenv("DATABRICKS_HOST", "").strip()
    token = os.getenv("DATABRICKS_TOKEN", "").strip()
    if not host or not token:
        raise ValueError("Set DATABRICKS_HOST and DATABRICKS_TOKEN in .env")

    w = WorkspaceClient(host=host, token=token)
    filename = remote_path.rstrip("/").split("/")[-1]
    path, fid = _dest_path(download_dir, filename)

    with w.dbfs.open(remote_path, read=True) as src, open(path, "wb") as dst:
        while True:
            chunk = src.read(1 << 20)  # 1 MB chunks
            if not chunk:
                break
            dst.write(chunk)
    logger.info("Databricks: downloaded %s → %s", remote_path, path)
    return path, fid


# ══════════════════════════════════════════════════════════════════════════════
# Unified dispatcher
# ══════════════════════════════════════════════════════════════════════════════

def download_from_cloud(
    provider: str,
    uri: str,
    container_or_bucket: Optional[str],
    blob_or_key: Optional[str],
    download_dir: str,
) -> tuple[str, str]:
    """
    Route to the correct provider download function.
    Returns (local_path, file_id).
    """
    p = provider.lower()

    if p == "azure":
        # Accept full HTTPS URL or explicit container+blob
        if uri.startswith("https://") and ".blob.core.windows.net/" in uri:
            parts = re.sub(r"https://[^/]+\.blob\.core\.windows\.net/", "", uri).split("/", 1)
            container_or_bucket = parts[0]
            blob_or_key = parts[1] if len(parts) > 1 else ""
        elif uri.startswith("az://"):
            rest = uri[5:]
            parts = rest.split("/", 1)
            container_or_bucket = parts[0]
            blob_or_key = parts[1] if len(parts) > 1 else ""
        return download_azure(container_or_bucket, blob_or_key, download_dir)

    if p == "aws":
        if uri.startswith("s3://"):
            rest = uri[5:]
            parts = rest.split("/", 1)
            container_or_bucket = parts[0]
            blob_or_key = parts[1] if len(parts) > 1 else ""
        return download_s3(container_or_bucket, blob_or_key, download_dir)

    if p == "gcp":
        if uri.startswith("gs://"):
            rest = uri[5:]
            parts = rest.split("/", 1)
            container_or_bucket = parts[0]
            blob_or_key = parts[1] if len(parts) > 1 else ""
        return download_gcs(container_or_bucket, blob_or_key, download_dir)

    if p == "databricks":
        return download_databricks(uri, download_dir)

    raise ValueError(f"Unknown cloud provider: {provider!r}. Supported: azure, aws, gcp, databricks")


# ══════════════════════════════════════════════════════════════════════════════
# Folder / prefix download  (returns list of local paths)
# ══════════════════════════════════════════════════════════════════════════════

def download_folder_azure(container: str, prefix: str, dest_dir: str) -> list[str]:
    try:
        from azure.storage.blob import BlobServiceClient
    except ImportError:
        raise RuntimeError("azure-storage-blob is not installed.")

    conn_str  = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "").strip()
    acct_name = os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "").strip()
    acct_key  = os.getenv("AZURE_STORAGE_ACCOUNT_KEY", "").strip()

    if conn_str:
        client = BlobServiceClient.from_connection_string(conn_str)
    elif acct_name and acct_key:
        client = BlobServiceClient(
            account_url=f"https://{acct_name}.blob.core.windows.net",
            credential=acct_key,
        )
    else:
        raise ValueError("Set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME + KEY")

    cc = client.get_container_client(container)
    os.makedirs(dest_dir, exist_ok=True)
    paths = []
    for blob in cc.list_blobs(name_starts_with=prefix):
        rel = blob.name[len(prefix):].lstrip("/")
        local = os.path.join(dest_dir, rel)
        os.makedirs(os.path.dirname(local) or dest_dir, exist_ok=True)
        with open(local, "wb") as fh:
            cc.get_blob_client(blob.name).download_blob().readinto(fh)
        paths.append(local)
    return paths


def download_folder_s3(bucket: str, prefix: str, dest_dir: str) -> list[str]:
    try:
        import boto3
    except ImportError:
        raise RuntimeError("boto3 is not installed.")

    kwargs: dict = {}
    region = os.getenv("AWS_REGION", "").strip()
    ak = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
    sk = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
    if region:
        kwargs["region_name"] = region
    if ak and sk:
        kwargs.update(aws_access_key_id=ak, aws_secret_access_key=sk)

    s3 = boto3.client("s3", **kwargs)
    paginator = s3.get_paginator("list_objects_v2")
    os.makedirs(dest_dir, exist_ok=True)
    paths = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            rel = obj["Key"][len(prefix):].lstrip("/")
            if not rel:
                continue
            local = os.path.join(dest_dir, rel)
            os.makedirs(os.path.dirname(local) or dest_dir, exist_ok=True)
            s3.download_file(bucket, obj["Key"], local)
            paths.append(local)
    return paths


def download_folder_gcs(bucket: str, prefix: str, dest_dir: str) -> list[str]:
    try:
        from google.cloud import storage as gcs
    except ImportError:
        raise RuntimeError("google-cloud-storage is not installed.")

    creds_json = os.getenv("GCP_CREDENTIALS_JSON", "").strip()
    project    = os.getenv("GCP_PROJECT_ID", "").strip() or None

    if creds_json:
        from google.oauth2 import service_account
        creds = service_account.Credentials.from_service_account_file(creds_json)
        client = gcs.Client(project=project, credentials=creds)
    else:
        client = gcs.Client(project=project)

    bkt = client.bucket(bucket)
    os.makedirs(dest_dir, exist_ok=True)
    paths = []
    for blob in client.list_blobs(bucket, prefix=prefix):
        rel = blob.name[len(prefix):].lstrip("/")
        if not rel:
            continue
        local = os.path.join(dest_dir, rel)
        os.makedirs(os.path.dirname(local) or dest_dir, exist_ok=True)
        blob.download_to_filename(local)
        paths.append(local)
    return paths


def download_folder_databricks(remote_path: str, dest_dir: str) -> list[str]:
    try:
        from databricks.sdk import WorkspaceClient
    except ImportError:
        raise RuntimeError("databricks-sdk is not installed.")

    host  = os.getenv("DATABRICKS_HOST", "").strip()
    token = os.getenv("DATABRICKS_TOKEN", "").strip()
    if not host or not token:
        raise ValueError("Set DATABRICKS_HOST and DATABRICKS_TOKEN in .env")

    w = WorkspaceClient(host=host, token=token)
    os.makedirs(dest_dir, exist_ok=True)
    paths = []

    def _recurse(path: str, local_base: str):
        for item in w.dbfs.list(path):
            local = os.path.join(local_base, item.path.split("/")[-1])
            if item.is_dir:
                os.makedirs(local, exist_ok=True)
                _recurse(item.path, local)
            else:
                with w.dbfs.open(item.path, read=True) as src, open(local, "wb") as dst:
                    while True:
                        chunk = src.read(1 << 20)
                        if not chunk:
                            break
                        dst.write(chunk)
                paths.append(local)

    _recurse(remote_path, dest_dir)
    return paths


def download_folder_from_cloud(
    provider: str,
    uri: str,
    container_or_bucket: Optional[str],
    prefix: Optional[str],
    dest_dir: str,
) -> list[str]:
    """
    Download all files under a cloud prefix/directory.
    Returns list of local file paths.
    """
    p = provider.lower()

    # Parse composite URIs
    if p == "azure":
        if uri.startswith("https://") and ".blob.core.windows.net/" in uri:
            rest = re.sub(r"https://[^/]+\.blob\.core\.windows\.net/", "", uri)
            parts = rest.split("/", 1)
            container_or_bucket, prefix = parts[0], (parts[1] if len(parts) > 1 else "")
        elif uri.startswith("az://"):
            rest = uri[5:]
            parts = rest.split("/", 1)
            container_or_bucket, prefix = parts[0], (parts[1] if len(parts) > 1 else "")
        return download_folder_azure(container_or_bucket, prefix or "", dest_dir)

    if p == "aws":
        if uri.startswith("s3://"):
            rest = uri[5:]
            parts = rest.split("/", 1)
            container_or_bucket, prefix = parts[0], (parts[1] if len(parts) > 1 else "")
        return download_folder_s3(container_or_bucket, prefix or "", dest_dir)

    if p == "gcp":
        if uri.startswith("gs://"):
            rest = uri[5:]
            parts = rest.split("/", 1)
            container_or_bucket, prefix = parts[0], (parts[1] if len(parts) > 1 else "")
        return download_folder_gcs(container_or_bucket, prefix or "", dest_dir)

    if p == "databricks":
        return download_folder_databricks(uri, dest_dir)

    raise ValueError(f"Unknown cloud provider: {provider!r}. Supported: azure, aws, gcp, databricks")
