use tauri::{Emitter, WebviewWindow};
use tauri_plugin_oauth::{cancel, start_with_config, OauthConfig};

const OAUTH_PORT: u16 = 18765;
const AUTH_HOST: &str = "dpuhmlbfxakbqmpzbfsb.supabase.co";

#[tauri::command]
fn start_oauth(window: WebviewWindow) -> Result<u16, String> {
    let config = OauthConfig {
        ports: Some(vec![OAUTH_PORT]),
        response: Some("<html><body style='font:16px sans-serif;padding:3rem'>Sign-in received. You can return to Mamungkun and close this tab.</body></html>".into()),
        ..Default::default()
    };
    start_with_config(config, move |callback_url| {
        if let Ok(parsed) = url::Url::parse(&callback_url) {
            if parsed.scheme() == "http"
                && parsed.host_str() == Some("127.0.0.1")
                && parsed.port() == Some(OAUTH_PORT)
                && parsed.path() == "/"
            {
                let _ = window.emit("mamungkun-oauth-callback", callback_url);
            }
        }
    })
    .map_err(|error| format!("Could not start the sign-in callback: {error}"))
}

#[tauri::command]
fn cancel_oauth(port: u16) -> Result<(), String> {
    if port != OAUTH_PORT {
        return Err("Invalid sign-in callback port".into());
    }
    cancel(port).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_login_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|error| error.to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some(AUTH_HOST)
        || parsed.path() != "/auth/v1/authorize"
    {
        return Err("Unexpected sign-in address".into());
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            start_oauth,
            cancel_oauth,
            open_login_url
        ])
        .run(tauri::generate_context!())
        .expect("Mamungkun could not start");
}
