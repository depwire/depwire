pub fn validate_email(email: &str) -> bool {
    email.contains('@') && email.contains('.')
}

pub fn format_name(first: &str, last: &str) -> String {
    format!("{} {}", first, last)
}

fn internal_helper(s: &str) -> String {
    s.trim().to_lowercase()
}
