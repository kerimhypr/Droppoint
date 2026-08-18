use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
use uuid::Uuid;

const CHUNK: usize = 1024 * 1024;

pub async fn send_file<W: AsyncWrite + Unpin>(
    mut out: W,
    mut file: tokio::fs::File,
    size: u64,
) -> Result<()> {
    let mut left = size;
    let mut buf = vec![0u8; CHUNK];
    while left > 0 {
        let n = file.read(&mut buf[..(left as usize).min(CHUNK)]).await?;
        if n == 0 {
            anyhow::bail!("file ended before advertised size");
        }
        out.write_all(&(n as u32).to_be_bytes()).await?;
        out.write_all(&buf[..n]).await?;
        left -= n as u64;
    }
    out.write_all(&0u32.to_be_bytes()).await?;
    out.flush().await?;
    Ok(())
}

pub async fn receive_file<R: AsyncRead + Unpin>(
    mut input: R,
    mut file: tokio::fs::File,
    expected: u64,
    expected_sha256: &str,
) -> Result<()> {
    let mut total = 0;
    let mut hash = Sha256::new();
    loop {
        let n = input.read_u32().await? as usize;
        if n == 0 {
            break;
        }
        if n > CHUNK || total + n as u64 > expected {
            anyhow::bail!("invalid chunk length");
        }
        let mut buf = vec![0; n];
        input.read_exact(&mut buf).await?;
        file.write_all(&buf).await?;
        hash.update(&buf);
        total += n as u64;
    }
    if total != expected || format!("{:x}", hash.finalize()) != expected_sha256 {
        anyhow::bail!("file integrity check failed");
    }
    Ok(())
}

pub async fn listen(bind: &str) -> Result<TcpListener> {
    Ok(TcpListener::bind(bind)
        .await
        .context("bind transfer listener")?)
}
pub fn transfer_id() -> Uuid {
    Uuid::new_v4()
}
pub async fn connect(addr: &str) -> Result<TcpStream> {
    Ok(TcpStream::connect(addr).await?)
}
