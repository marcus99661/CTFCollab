use serde::Deserialize;

const CONFIG_PATH: &str = "config.yml";

#[derive(Debug, Deserialize)]
pub struct RuntimeConfig {
    #[serde(default = "default_registration_enabled")]
    pub registration_enabled: bool,
}

fn default_registration_enabled() -> bool {
    true
}

// Defaults if CONFIG_PATH file doesnt exist
impl Default for RuntimeConfig {
    fn default() -> Self {
        Self { registration_enabled: true }
    }
}

impl RuntimeConfig {
    pub fn load() -> Self {
        match std::fs::read_to_string(CONFIG_PATH) {
            Ok(text) => serde_yaml::from_str(&text).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }
}