/// Generic retry logic for LLM API calls with exponential backoff + jitter.
/// Handles 429 (rate limit) and transient server errors (5xx).

use std::time::Duration;
use tokio::time::sleep;

/// Default maximum number of retries for a single API call.
pub const DEFAULT_MAX_RETRIES: u32 = 3;

/// Base delay in milliseconds for exponential backoff.
const BASE_DELAY_MS: u64 = 1000;

/// Maximum delay cap in milliseconds (30 seconds).
const MAX_DELAY_MS: u64 = 30_000;

/// Calculate the delay for a given retry attempt with exponential backoff + jitter.
///
/// Formula: `min(BASE * 2^attempt, MAX) + random_jitter(0..BASE)`
///
/// Attempt 0 → ~1s, Attempt 1 → ~2s, Attempt 2 → ~4s (all ±jitter)
fn backoff_delay_ms(attempt: u32) -> u64 {
    let exp_delay = BASE_DELAY_MS.saturating_mul(1u64.checked_shl(attempt).unwrap_or(u64::MAX));
    let capped = exp_delay.min(MAX_DELAY_MS);
    // Simple jitter: add 0..500ms using a cheap pseudo-random from attempt
    let jitter = ((attempt as u64).wrapping_mul(7919) % 500);
    capped + jitter
}

/// Determine if an HTTP status code is retryable.
pub fn is_retryable_status(status: u16) -> bool {
    // 429 = rate limited, 500/502/503/504 = server errors
    matches!(status, 429 | 500 | 502 | 503 | 504)
}

/// Execute an async operation with automatic retry on retryable errors.
///
/// The operation closure receives the current attempt number (0-based).
/// It should return `Ok(T)` on success or `Err(String)` on failure.
///
/// Retries are only attempted for:
/// - HTTP 429 (rate limited) — respects `Retry-After` header if available
/// - HTTP 5xx (server errors)
/// - Network errors (timeout, connection reset)
///
/// Non-retryable errors (4xx except 429) are returned immediately.
pub async fn retry_async<F, Fut, T>(
    max_retries: u32,
    operation: F,
) -> Result<T, String>
where
    F: Fn(u32) -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let mut last_error = String::new();

    for attempt in 0..=max_retries {
        match operation(attempt).await {
            Ok(result) => return Ok(result),
            Err(err) => {
                last_error = err.clone();

                // Don't retry if this is the last attempt
                if attempt >= max_retries {
                    break;
                }

                // Check if the error is retryable
                let should_retry = is_retryable_error(&err);
                if !should_retry {
                    break;
                }

                let delay_ms = backoff_delay_ms(attempt);

                // Check for Retry-After hint in error message
                let retry_after_ms = extract_retry_after(&err);
                let actual_delay = retry_after_ms.unwrap_or(delay_ms);

                log::warn!(
                    "LLM request failed (attempt {}/{}): {}. Retrying in {}ms...",
                    attempt + 1,
                    max_retries + 1,
                    truncate_error(&err, 100),
                    actual_delay,
                );

                sleep(Duration::from_millis(actual_delay)).await;
            }
        }
    }

    Err(last_error)
}

/// Check if an error message indicates a retryable condition.
fn is_retryable_error(err: &str) -> bool {
    // HTTP status patterns
    if err.contains("429") || err.contains("rate limit") || err.contains("Rate limit") {
        return true;
    }
    if err.contains("500") || err.contains("502") || err.contains("503") || err.contains("504") {
        return true;
    }
    // Network errors
    if err.contains("timeout") || err.contains("connection reset") || err.contains("Connection refused") {
        return true;
    }
    false
}

/// Try to extract `Retry-After` value from error message (in seconds).
/// Returns delay in milliseconds if found.
fn extract_retry_after(err: &str) -> Option<u64> {
    // Look for patterns like "Retry-After: 5" or "retry_after=5"
    let re = regex::Regex::new(r"(?i)retry.?after[:\s=]+(\d+)").ok()?;
    let caps = re.captures(err)?;
    let secs: u64 = caps.get(1)?.as_str().parse().ok()?;
    Some(secs * 1000)
}

/// Truncate an error message for logging.
fn truncate_error(err: &str, max_len: usize) -> String {
    if err.len() <= max_len {
        err.to_string()
    } else {
        format!("{}...", &err[..max_len])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backoff_delay_increases() {
        let d0 = backoff_delay_ms(0);
        let d1 = backoff_delay_ms(1);
        let d2 = backoff_delay_ms(2);
        // Base delays should increase (ignoring jitter)
        assert!(d0 >= 1000);
        assert!(d1 > d0 - 500); // Account for jitter range
        assert!(d2 > d1 - 500);
    }

    #[test]
    fn test_backoff_delay_capped() {
        let d = backoff_delay_ms(20);
        assert!(d <= MAX_DELAY_MS + 500); // cap + max jitter
    }

    #[test]
    fn test_is_retryable_status() {
        assert!(is_retryable_status(429));
        assert!(is_retryable_status(500));
        assert!(is_retryable_status(502));
        assert!(is_retryable_status(503));
        assert!(is_retryable_status(504));
        assert!(!is_retryable_status(400));
        assert!(!is_retryable_status(401));
        assert!(!is_retryable_status(403));
        assert!(!is_retryable_status(404));
    }

    #[test]
    fn test_is_retryable_error() {
        assert!(is_retryable_error("Rate limited (429): too many requests"));
        assert!(is_retryable_error("LLM API error (503): service unavailable"));
        assert!(is_retryable_error("connection reset by peer"));
        assert!(!is_retryable_error("LLM API error (400): bad request"));
        assert!(!is_retryable_error("LLM API error (401): unauthorized"));
    }

    #[tokio::test]
    async fn test_retry_async_success_first_try() {
        let result = retry_async(2, |_attempt| async { Ok::<i32, String>(42) }).await;
        assert_eq!(result, Ok(42));
    }

    #[tokio::test]
    async fn test_retry_async_success_after_retry() {
        let attempt_count = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let count_clone = attempt_count.clone();
        let result = retry_async(3, move |_attempt| {
            let c = count_clone.clone();
            async move {
                let n = c.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if n < 2 {
                    Err("429: rate limited".to_string())
                } else {
                    Ok(99)
                }
            }
        })
        .await;
        assert_eq!(result, Ok(99));
        assert_eq!(attempt_count.load(std::sync::atomic::Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_retry_async_non_retryable_no_retry() {
        let attempt_count = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let count_clone = attempt_count.clone();
        let result = retry_async(3, move |_attempt| {
            let c = count_clone.clone();
            async move {
                c.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Err::<i32, String>("LLM API error (400): bad request".to_string())
            }
        })
        .await;
        assert!(result.is_err());
        assert_eq!(attempt_count.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}
