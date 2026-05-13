/// Local HTTP callback server for OAuth2 Authorization Code flow.
///
/// Binds to 127.0.0.1 on a random port, waits for the browser redirect,
/// extracts the `code` and `state` query parameters, then shuts down.

use anyhow::{anyhow, Context, Result};
use std::{
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc,
};

const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html>
<head><title>OpenPika Login</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0;}
.card{background:#1e293b;border-radius:12px;padding:2rem 3rem;text-align:center;}
h1{color:#38bdf8;}p{color:#94a3b8;}</style></head>
<body><div class="card">
<h1>Authentication successful</h1>
<p>You can close this window and return to OpenPika.</p>
</div></body></html>"#;

const ERROR_HTML: &str = r#"<!DOCTYPE html>
<html>
<head><title>OpenPika — Login failed</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0;}
.card{background:#1e293b;border-radius:12px;padding:2rem 3rem;text-align:center;}
h1{color:#f87171;}p{color:#94a3b8;}</style></head>
<body><div class="card">
<h1>Authentication failed</h1>
<p>Check the terminal for details.</p>
</div></body></html>"#;

#[derive(Debug)]
pub struct CallbackParams {
    pub code: String,
    pub state: String,
}

/// Start the callback listener, return (port, receiver).
/// The receiver delivers the first valid callback params (or an error string).
/// Callers use `recv_timeout` on the returned receiver to enforce wall-clock limits.
pub fn start() -> Result<(u16, mpsc::Receiver<Result<CallbackParams>>)> {
    let listener = TcpListener::bind("127.0.0.1:0").context("bind callback server")?;
    let port = listener.local_addr()?.port();

    let (tx, rx) = mpsc::channel::<Result<CallbackParams>>();

    listener
        .set_nonblocking(false)
        .context("set_nonblocking")?;

    std::thread::spawn(move || {
        // Accept one connection. The caller uses recv_timeout on the channel
        // so overall login has a wall-clock bound even if accept() blocks.
        match listener.accept() {
            Ok((stream, _)) => {
                match handle_request(stream) {
                    Ok(params) => { let _ = tx.send(Ok(params)); }
                    Err(e)     => { let _ = tx.send(Err(e)); }
                }
            }
            Err(e) => {
                let _ = tx.send(Err(anyhow!("Callback server timed out: {e}")));
            }
        }
    });

    Ok((port, rx))
}

fn handle_request(mut stream: TcpStream) -> Result<CallbackParams> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;

    // Parse GET /?code=...&state=... HTTP/1.1
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| anyhow!("Malformed HTTP request line"))?;

    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    let params = parse_query(query);

    let code = params
        .get("code")
        .cloned()
        .ok_or_else(|| anyhow!("No 'code' in callback query: {query}"))?;

    let error = params.get("error").cloned();

    let (status, body) = if error.is_none() && !code.is_empty() {
        ("200 OK", SUCCESS_HTML)
    } else {
        let _desc = params.get("error_description").cloned().unwrap_or_default();
        ("400 Bad Request", ERROR_HTML)
    };

    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()?;

    if let Some(err) = error {
        return Err(anyhow!("OAuth2 provider error: {err}"));
    }

    let state = params.get("state").cloned().unwrap_or_default();
    Ok(CallbackParams { code, state })
}

fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            Some((url_decode(k), url_decode(v)))
        })
        .collect()
}

fn url_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h: String = chars.by_ref().take(2).collect();
            if let Ok(b) = u8::from_str_radix(&h, 16) {
                out.push(b as char);
            } else {
                out.push('%');
                out.push_str(&h);
            }
        } else if c == '+' {
            out.push(' ');
        } else {
            out.push(c);
        }
    }
    out
}
