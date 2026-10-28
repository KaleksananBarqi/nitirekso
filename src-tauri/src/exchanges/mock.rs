use super::types::{RawAccountBalance, RawClosedPosition, RawFill, RawFundingFee, SyncCursor};
use super::ExchangeAdapter;
use std::sync::{Arc, Mutex};

/// Implementasi mock exchange adapter untuk pengujian siklus sinkronisasi secara deterministik
#[derive(Debug, Clone)]
pub struct MockExchangeAdapter {
    id: String,
    display_name: String,
    positions: Vec<RawClosedPosition>,
    fills: Vec<RawFill>,
    funding_fees: Vec<RawFundingFee>,
    balances: Vec<RawAccountBalance>,
    positions_error: Option<String>,
    fills_error: Option<String>,
    funding_error: Option<String>,
    balances_error: Option<String>,
    recorded_position_cursors: Arc<Mutex<Vec<SyncCursor>>>,
    recorded_fill_cursors: Arc<Mutex<Vec<SyncCursor>>>,
    recorded_funding_cursors: Arc<Mutex<Vec<SyncCursor>>>,
}

impl MockExchangeAdapter {
    /// Membuat adapter mock baru dengan ID bursa yang diberikan
    pub fn new(id: impl Into<String>) -> Self {
        let id_str = id.into();
        let display = format!("Mock {}", id_str);
        Self {
            id: id_str,
            display_name: display,
            positions: Vec::new(),
            fills: Vec::new(),
            funding_fees: Vec::new(),
            balances: Vec::new(),
            positions_error: None,
            fills_error: None,
            funding_error: None,
            balances_error: None,
            recorded_position_cursors: Arc::new(Mutex::new(Vec::new())),
            recorded_fill_cursors: Arc::new(Mutex::new(Vec::new())),
            recorded_funding_cursors: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Mengatur nama tampilan bursa
    pub fn with_display_name(mut self, name: impl Into<String>) -> Self {
        self.display_name = name.into();
        self
    }

    /// Menetapkan data posisi tertutup tiruan yang akan dikembalikan
    pub fn with_positions(mut self, positions: Vec<RawClosedPosition>) -> Self {
        self.positions = positions;
        self
    }

    /// Menetapkan data eksekusi (fills) tiruan yang akan dikembalikan
    pub fn with_fills(mut self, fills: Vec<RawFill>) -> Self {
        self.fills = fills;
        self
    }

    /// Menetapkan data biaya pendanaan (funding fees) tiruan yang akan dikembalikan
    pub fn with_funding_fees(mut self, fees: Vec<RawFundingFee>) -> Self {
        self.funding_fees = fees;
        self
    }

    /// Menetapkan data saldo akun tiruan yang akan dikembalikan
    pub fn with_balances(mut self, balances: Vec<RawAccountBalance>) -> Self {
        self.balances = balances;
        self
    }

    /// Mensimulasikan kegagalan / error saat penarikan posisi tertutup
    pub fn with_positions_error(mut self, err: impl Into<String>) -> Self {
        self.positions_error = Some(err.into());
        self
    }

    /// Mensimulasikan kegagalan / error saat penarikan fills
    pub fn with_fills_error(mut self, err: impl Into<String>) -> Self {
        self.fills_error = Some(err.into());
        self
    }

    /// Mensimulasikan kegagalan / error saat penarikan funding fees
    pub fn with_funding_error(mut self, err: impl Into<String>) -> Self {
        self.funding_error = Some(err.into());
        self
    }

    /// Mensimulasikan kegagalan / error saat penarikan saldo akun
    pub fn with_balances_error(mut self, err: impl Into<String>) -> Self {
        self.balances_error = Some(err.into());
        self
    }

    /// Mengubah konfigurasi error penarikan posisi secara langsung
    pub fn set_positions_error(&mut self, err: Option<String>) {
        self.positions_error = err;
    }

    /// Mengubah konfigurasi error penarikan fills secara langsung
    pub fn set_fills_error(&mut self, err: Option<String>) {
        self.fills_error = err;
    }

    /// Mengubah konfigurasi error penarikan funding secara langsung
    pub fn set_funding_error(&mut self, err: Option<String>) {
        self.funding_error = err;
    }

    /// Mengubah konfigurasi error penarikan saldo secara langsung
    pub fn set_balances_error(&mut self, err: Option<String>) {
        self.balances_error = err;
    }

    /// Mengambil seluruh riwayat kursor yang dikirim ke `fetch_closed_positions`
    pub fn recorded_position_cursors(&self) -> Vec<SyncCursor> {
        self.recorded_position_cursors.lock().unwrap().clone()
    }

    /// Mengambil seluruh riwayat kursor yang dikirim ke `fetch_fills`
    pub fn recorded_fill_cursors(&self) -> Vec<SyncCursor> {
        self.recorded_fill_cursors.lock().unwrap().clone()
    }

    /// Mengambil seluruh riwayat kursor yang dikirim ke `fetch_funding_fees`
    pub fn recorded_funding_cursors(&self) -> Vec<SyncCursor> {
        self.recorded_funding_cursors.lock().unwrap().clone()
    }

    /// Mengambil kursor posisi terakhir yang diterima
    pub fn last_position_cursor(&self) -> Option<SyncCursor> {
        self.recorded_position_cursors.lock().unwrap().last().cloned()
    }

    /// Mengambil kursor fills terakhir yang diterima
    pub fn last_fill_cursor(&self) -> Option<SyncCursor> {
        self.recorded_fill_cursors.lock().unwrap().last().cloned()
    }

    /// Mengambil kursor funding fee terakhir yang diterima
    pub fn last_funding_cursor(&self) -> Option<SyncCursor> {
        self.recorded_funding_cursors.lock().unwrap().last().cloned()
    }

    /// Menghitung jumlah panggilan pada fungsi penarikan posisi
    pub fn position_calls(&self) -> usize {
        self.recorded_position_cursors.lock().unwrap().len()
    }

    /// Menghitung jumlah panggilan pada fungsi penarikan fills
    pub fn fill_calls(&self) -> usize {
        self.recorded_fill_cursors.lock().unwrap().len()
    }

    /// Menghitung jumlah panggilan pada fungsi penarikan funding
    pub fn funding_calls(&self) -> usize {
        self.recorded_funding_cursors.lock().unwrap().len()
    }
}

impl Default for MockExchangeAdapter {
    fn default() -> Self {
        Self::new("mock")
    }
}

impl ExchangeAdapter for MockExchangeAdapter {
    fn id(&self) -> &str {
        &self.id
    }

    fn display_name(&self) -> &str {
        &self.display_name
    }

    async fn fetch_closed_positions(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawClosedPosition>, String> {
        self.recorded_position_cursors.lock().unwrap().push(cursor.clone());
        if let Some(err) = &self.positions_error {
            return Err(err.clone());
        }
        Ok(self.positions.clone())
    }

    async fn fetch_fills(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFill>, String> {
        self.recorded_fill_cursors.lock().unwrap().push(cursor.clone());
        if let Some(err) = &self.fills_error {
            return Err(err.clone());
        }
        Ok(self.fills.clone())
    }

    async fn fetch_funding_fees(
        &self,
        cursor: &SyncCursor,
    ) -> Result<Vec<RawFundingFee>, String> {
        self.recorded_funding_cursors.lock().unwrap().push(cursor.clone());
        if let Some(err) = &self.funding_error {
            return Err(err.clone());
        }
        Ok(self.funding_fees.clone())
    }

    async fn fetch_balances(&self) -> Result<Vec<RawAccountBalance>, String> {
        if let Some(err) = &self.balances_error {
            return Err(err.clone());
        }
        Ok(self.balances.clone())
    }
}
