//! A minimal SOCKS4/SOCKS4a/SOCKS5 server, just enough to learn a dynamic
//! forward's own destination from whatever connected wanting one.
//!
//! ADR-0054. Only `CONNECT` is answered: SOCKS also defines `BIND` and `UDP
//! ASSOCIATE`, and this application, a terminal and file transfer client,
//! has no use for either. Only no-authentication is offered on SOCKS5,
//! which is the same trust boundary a local forward's own bind already
//! rests on: `ssh::forward::listen_dynamic` binds loopback only, so nothing
//! reaches this that was not already running as the user.
//!
//! A SOCKS proxy changes how much other traffic can reach through a
//! connection, more than a fixed single-destination forward does: naming
//! that plainly is worth doing wherever a dynamic forward is offered, not
//! assumed obvious.

use std::net::{Ipv4Addr, Ipv6Addr};

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::ssh::connection::Endpoint;

/// `USERID` (SOCKS4) and a hostname (SOCKS4a) are both null-terminated
/// fields of unbounded length on the wire; this is the ceiling past which a
/// request is treated as malformed rather than read forever.
const MAX_FIELD: usize = 256;

/// Reads a `CONNECT` request from `stream` and answers it, returning the
/// destination it named.
///
/// `None` on anything this does not support or cannot parse: a version
/// nobody offered, a command other than `CONNECT`, or a malformed request.
/// The connection is left for the caller to drop in that case, the same
/// answer a real SOCKS server gives a request it will not serve.
pub async fn handshake<S: AsyncRead + AsyncWrite + Unpin>(stream: &mut S) -> Option<Endpoint> {
    match stream.read_u8().await.ok()? {
        4 => socks4(stream).await,
        5 => socks5(stream).await,
        _ => None,
    }
}

/// SOCKS4 CONNECT, `VN` already consumed by [`handshake`].
///
/// SOCKS4a is the same request with the four-byte `DSTIP` field set to
/// `0.0.0.x` (`x` non-zero) as a marker: the real destination follows
/// `USERID`, as a hostname rather than an address, so the far end can
/// resolve a name a local resolver would answer differently for, or not at
/// all. `Connection::open_forward` already takes a hostname string and lets
/// the server resolve it, so this falls out of the existing call rather than
/// needing a resolver here.
async fn socks4<S: AsyncRead + AsyncWrite + Unpin>(stream: &mut S) -> Option<Endpoint> {
    const GRANTED: [u8; 8] = [0x00, 0x5a, 0, 0, 0, 0, 0, 0];
    const REFUSED: [u8; 8] = [0x00, 0x5b, 0, 0, 0, 0, 0, 0];

    let command = stream.read_u8().await.ok()?;
    let port = stream.read_u16().await.ok()?;
    let mut address = [0u8; 4];
    stream.read_exact(&mut address).await.ok()?;

    if command != 1 {
        let _ = stream.write_all(&REFUSED).await;
        return None;
    }

    read_null_terminated(stream).await?; // USERID, unread by anything here.

    let is_socks4a = address[0] == 0 && address[1] == 0 && address[2] == 0 && address[3] != 0;
    let host = if is_socks4a {
        String::from_utf8(read_null_terminated(stream).await?).ok()?
    } else {
        Ipv4Addr::from(address).to_string()
    };

    stream.write_all(&GRANTED).await.ok()?;
    Some(Endpoint { host, port })
}

/// Reads bytes up to and excluding a `0x00` terminator. `None` past
/// [`MAX_FIELD`] bytes with no terminator seen, or on a read failure.
async fn read_null_terminated<S: AsyncRead + Unpin>(stream: &mut S) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    loop {
        if bytes.len() >= MAX_FIELD {
            return None;
        }
        match stream.read_u8().await.ok()? {
            0 => return Some(bytes),
            byte => bytes.push(byte),
        }
    }
}

/// SOCKS5, `VER` already consumed by [`handshake`]: the method negotiation,
/// then the request itself.
async fn socks5<S: AsyncRead + AsyncWrite + Unpin>(stream: &mut S) -> Option<Endpoint> {
    let method_count = stream.read_u8().await.ok()?;
    let mut methods = vec![0u8; usize::from(method_count)];
    stream.read_exact(&mut methods).await.ok()?;

    if !methods.contains(&0x00) {
        /* 0xff: no acceptable method. The client offered only ones this
        does not speak, most often username/password, which a loopback-only
        listener has no need to ask for. */
        let _ = stream.write_all(&[0x05, 0xff]).await;
        return None;
    }
    stream.write_all(&[0x05, 0x00]).await.ok()?;

    let mut header = [0u8; 4];
    stream.read_exact(&mut header).await.ok()?;
    let [version, command, _reserved, address_type] = header;
    if version != 5 {
        return None;
    }

    /* `BND.ADDR`/`BND.PORT` in every reply below are the address this
    process would accept an incoming connection on for `BIND`, meaningless
    for `CONNECT`, which is all this answers; zero is what a minimal SOCKS5
    server conventionally sends there, and no client this proxies for reads
    it for anything. */
    if command != 1 {
        let _ = stream
            .write_all(&[0x05, 0x07, 0, 0x01, 0, 0, 0, 0, 0, 0])
            .await;
        return None;
    }

    let host = match address_type {
        0x01 => {
            let mut address = [0u8; 4];
            stream.read_exact(&mut address).await.ok()?;
            Ipv4Addr::from(address).to_string()
        }
        0x03 => {
            let length = usize::from(stream.read_u8().await.ok()?);
            let mut name = vec![0u8; length];
            stream.read_exact(&mut name).await.ok()?;
            String::from_utf8(name).ok()?
        }
        0x04 => {
            let mut address = [0u8; 16];
            stream.read_exact(&mut address).await.ok()?;
            Ipv6Addr::from(address).to_string()
        }
        _ => {
            let _ = stream
                .write_all(&[0x05, 0x08, 0, 0x01, 0, 0, 0, 0, 0, 0])
                .await;
            return None;
        }
    };
    let port = stream.read_u16().await.ok()?;

    stream
        .write_all(&[0x05, 0x00, 0, 0x01, 0, 0, 0, 0, 0, 0])
        .await
        .ok()?;

    Some(Endpoint { host, port })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Drives `handshake` against one end of an in-memory duplex pair, the
    /// other end played by the test as the SOCKS client: no socket, no
    /// timing, just the bytes the protocol actually defines.
    async fn handshaken(request: &[u8]) -> (Option<Endpoint>, Vec<u8>) {
        let (mut server, mut client) = tokio::io::duplex(4096);
        client.write_all(request).await.expect("the request writes");
        /* Closes the client's own write half: a well-formed request never
        needs this, since the server reads exactly as many bytes as its own
        format calls for and stops, but a truncated one otherwise leaves the
        server waiting on bytes nobody sends, which is a hang rather than a
        refusal. A real client's connection ends the same way, eventually,
        whether it meant to or not. */
        client.shutdown().await.expect("the write half shuts down");

        let target = handshake(&mut server).await;
        drop(server);

        let mut reply = Vec::new();
        let _ = client.read_to_end(&mut reply).await;

        (target, reply)
    }

    #[tokio::test]
    async fn a_socks4_request_names_a_raw_address() {
        let mut request = vec![4, 1];
        request.extend_from_slice(&80u16.to_be_bytes());
        request.extend_from_slice(&[93, 184, 216, 34]); // example.com's own A record, fixed in time for this test
        request.push(0); // empty USERID

        let (target, reply) = handshaken(&request).await;
        let target = target.expect("a valid CONNECT request");
        assert_eq!(target.host, "93.184.216.34");
        assert_eq!(target.port, 80);
        assert_eq!(reply, [0x00, 0x5a, 0, 0, 0, 0, 0, 0]);
    }

    #[tokio::test]
    async fn a_socks4a_request_names_a_hostname_not_an_address() {
        let mut request = vec![4, 1];
        request.extend_from_slice(&22u16.to_be_bytes());
        request.extend_from_slice(&[0, 0, 0, 1]); // the SOCKS4a marker
        request.push(0); // empty USERID
        request.extend_from_slice(b"target.internal");
        request.push(0);

        let (target, _) = handshaken(&request).await;
        let target = target.expect("a valid SOCKS4a request");
        assert_eq!(target.host, "target.internal");
        assert_eq!(target.port, 22);
    }

    #[tokio::test]
    async fn a_socks4_userid_is_read_and_ignored() {
        let mut request = vec![4, 1];
        request.extend_from_slice(&22u16.to_be_bytes());
        request.extend_from_slice(&[10, 0, 0, 5]);
        request.extend_from_slice(b"someone");
        request.push(0);

        let (target, _) = handshaken(&request).await;
        assert_eq!(target.expect("a valid request").host, "10.0.0.5");
    }

    #[tokio::test]
    async fn a_socks4_bind_request_is_refused() {
        let mut request = vec![4, 2 /* BIND, not CONNECT */];
        request.extend_from_slice(&22u16.to_be_bytes());
        request.extend_from_slice(&[10, 0, 0, 5]);
        request.push(0);

        let (target, reply) = handshaken(&request).await;
        assert!(target.is_none());
        assert_eq!(reply, [0x00, 0x5b, 0, 0, 0, 0, 0, 0]);
    }

    #[tokio::test]
    async fn a_socks5_request_offering_no_auth_is_answered_with_it() {
        let mut request = vec![5, 1, 0x00]; // one method: no-auth
        request.extend_from_slice(&[5, 1, 0, 0x01]); // VER CMD RSV ATYP=IPv4
        request.extend_from_slice(&[93, 184, 216, 34]);
        request.extend_from_slice(&443u16.to_be_bytes());

        let (target, reply) = handshaken(&request).await;
        let target = target.expect("a valid CONNECT request");
        assert_eq!(target.host, "93.184.216.34");
        assert_eq!(target.port, 443);
        assert_eq!(
            &reply[..2],
            &[0x05, 0x00],
            "the method negotiation grants no-auth"
        );
        assert_eq!(&reply[2..4], &[0x05, 0x00], "the request itself succeeds");
    }

    #[tokio::test]
    async fn a_socks5_domain_name_request_is_not_resolved_locally() {
        let mut request = vec![5, 1, 0x00];
        request.extend_from_slice(&[5, 1, 0, 0x03]); // ATYP=domain
        let name = b"target.internal";
        request.push(name.len() as u8);
        request.extend_from_slice(name);
        request.extend_from_slice(&2222u16.to_be_bytes());

        let (target, _) = handshaken(&request).await;
        let target = target.expect("a valid CONNECT request");
        assert_eq!(target.host, "target.internal");
        assert_eq!(target.port, 2222);
    }

    #[tokio::test]
    async fn a_socks5_ipv6_request_is_answered() {
        let mut request = vec![5, 1, 0x00];
        request.extend_from_slice(&[5, 1, 0, 0x04]); // ATYP=IPv6
        request.extend_from_slice(&Ipv6Addr::LOCALHOST.octets());
        request.extend_from_slice(&22u16.to_be_bytes());

        let (target, _) = handshaken(&request).await;
        assert_eq!(target.expect("a valid request").host, "::1");
    }

    #[tokio::test]
    async fn a_socks5_client_offering_only_password_auth_is_refused() {
        let request = vec![5, 1, 0x02]; // one method: username/password

        let (target, reply) = handshaken(&request).await;
        assert!(target.is_none());
        assert_eq!(reply, [0x05, 0xff]);
    }

    #[tokio::test]
    async fn a_socks5_bind_request_is_refused() {
        let mut request = vec![5, 1, 0x00];
        request.extend_from_slice(&[5, 2 /* BIND */, 0, 0x01]);
        request.extend_from_slice(&[0, 0, 0, 0]);
        request.extend_from_slice(&0u16.to_be_bytes());

        let (target, reply) = handshaken(&request).await;
        assert!(target.is_none());
        assert_eq!(&reply[2..], [0x05, 0x07, 0, 0x01, 0, 0, 0, 0, 0, 0]);
    }

    #[tokio::test]
    async fn an_unsupported_version_is_refused() {
        let (target, reply) = handshaken(&[6, 0]).await;
        assert!(target.is_none());
        assert!(
            reply.is_empty(),
            "nothing is written back for a version this does not speak"
        );
    }

    #[tokio::test]
    async fn a_truncated_request_is_refused_rather_than_hanging() {
        let (target, _) = handshaken(&[5, 1]).await; // NMETHODS says 1, but no method byte follows
        assert!(target.is_none());
    }
}
