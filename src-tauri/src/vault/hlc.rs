use std::time::{SystemTime, UNIX_EPOCH};

/// Generator Hybrid Logical Clock (HLC) berformat string tetap `{wall_ms:013}-{counter:04}-{device_id}`.
/// Format terstruktur memungkinkan perbandingan urutan deterministik langsung lewat perbandingan string leksikografis.
#[derive(Debug, Clone)]
pub struct HlcGenerator {
    pub last_ms: i64,
    pub counter: u16,
    pub device_id: String,
}

impl HlcGenerator {
    pub fn new(device_id: impl Into<String>, persisted_hlc: Option<&str>) -> Self {
        let mut clock = Self {
            last_ms: 0,
            counter: 0,
            device_id: device_id.into(),
        };
        if let Some(hlc) = persisted_hlc {
            if let Some((ms, cnt)) = parse_hlc_prefix(hlc) {
                clock.last_ms = ms;
                clock.counter = cnt;
            }
        }
        clock
    }

    pub fn now_millis() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }

    pub fn tick(&mut self) -> String {
        self.tick_at(Self::now_millis())
    }

    pub fn tick_at(&mut self, wall_ms: i64) -> String {
        let clamped = wall_ms.max(0);
        if clamped > self.last_ms {
            self.last_ms = clamped;
            self.counter = 0;
        } else {
            self.counter = self.counter.saturating_add(1);
        }
        format_hlc(self.last_ms, self.counter, &self.device_id)
    }

    pub fn observe(&mut self, remote_hlc: &str) {
        self.observe_at(remote_hlc, Self::now_millis());
    }

    pub fn observe_at(&mut self, remote_hlc: &str, wall_ms: i64) {
        let clamped = wall_ms.max(0);
        if let Some((r_ms, r_cnt)) = parse_hlc_prefix(remote_hlc) {
            let max_ms = clamped.max(self.last_ms).max(r_ms);
            if max_ms == self.last_ms && max_ms == r_ms {
                self.counter = self.counter.max(r_cnt).saturating_add(1);
            } else if max_ms == self.last_ms {
                self.counter = self.counter.saturating_add(1);
            } else if max_ms == r_ms {
                self.counter = r_cnt.saturating_add(1);
            } else {
                self.counter = 0;
            }
            self.last_ms = max_ms;
        } else if clamped > self.last_ms {
            self.last_ms = clamped;
            self.counter = 0;
        }
    }

    pub fn current_string(&self) -> String {
        format_hlc(self.last_ms, self.counter, &self.device_id)
    }
}

pub fn format_hlc(wall_ms: i64, counter: u16, device_id: &str) -> String {
    format!("{:013}-{:04}-{}", wall_ms.max(0), counter, device_id)
}

pub fn parse_hlc_prefix(hlc: &str) -> Option<(i64, u16)> {
    let mut parts = hlc.splitn(3, '-');
    let ms = parts.next()?.parse::<i64>().ok()?;
    let cnt = parts.next()?.parse::<u16>().ok()?;
    Some((ms, cnt))
}

/// Mengembalikan true bila `candidate` secara kausal/leksikografis lebih baru daripada `existing`.
pub fn is_hlc_newer(candidate: &str, existing: Option<&str>) -> bool {
    match existing {
        None => true,
        Some(prev) if prev.trim().is_empty() => true,
        Some(prev) => candidate > prev,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hlc_monotonic_and_comparison() {
        let mut g1 = HlcGenerator::new("dev-a", None);
        let h1 = g1.tick_at(1_700_000_000_000);
        let h2 = g1.tick_at(1_700_000_000_000);
        assert!(h2 > h1);

        let mut g2 = HlcGenerator::new("dev-b", None);
        g2.observe_at(&h2, 1_699_999_999_000);
        let h3 = g2.tick_at(1_699_999_999_000);
        assert!(h3 > h2);
    }
}
